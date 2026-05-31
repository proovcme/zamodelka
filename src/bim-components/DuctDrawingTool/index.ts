import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { BaseLineTool } from "../BaseLineTool";
import { FittingGenerator } from "../FittingGenerator";

export interface DuctElement {
  id: string;
  type: "duct";
  shape: "round" | "rectangular";
  size: { d?: number; w?: number; h?: number };
  start: [number, number, number]; // в мм
  end: [number, number, number];   // в мм
  sortamentRef: string;
  material: string;
  system: string;
}

export const colorNameToHex: Record<string, number> = {
  "красный": 0xef4444,     // красный
  "синий": 0x3b82f6,       // синий
  "зеленый": 0x10b981,     // зеленый
  "коричневый": 0x7c2d12,   // коричневый
  "черный": 0x18181b,      // черный
};

export class DuctDrawingTool extends BaseLineTool {
  // Параметры черчения
  activeParams = {
    shape: "round" as "round" | "rectangular",
    size: { d: 200 } as { d?: number; w?: number; h?: number },
    sortamentRef: "VSN353-R-200",
    material: "steel_galv",
    system: "Приточный",
    elevation: 0, // в мм
  };

  // Группа для всех отрисованных мешей трасс
  ductsGroup = new THREE.Group();
  
  // Хранилище сгенерированных мешей для быстрого управления
  renderedDucts = new Map<string, THREE.Mesh>();

  constructor(components: OBC.Components, world: OBC.World) {
    super(components, world);
    
    // Добавляем группу в 3D сцену
    this.world.scene.three.add(this.ductsGroup);
  }

  // Очистка всех 3D-мешей со сцены
  clearAll() {
    while (this.ductsGroup.children.length > 0) {
      const child = this.ductsGroup.children[0] as THREE.Object3D;
      
      child.traverse((node: any) => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          if (Array.isArray(node.material)) {
            node.material.forEach((m: any) => m.dispose());
          } else {
            node.material.dispose();
          }
        }
      });
      
      this.ductsGroup.remove(child);
    }
    this.renderedDucts.clear();
  }

  // Отрисовка всей трассы из переданного списка элементов
  renderAll(elements: any[]) {
    this.clearAll();
    this.projectElements = elements;

    for (const elem of elements) {
      if (elem.type === "duct") {
        const { start, end } = this.getShortenedEndpoints(elem, elements);
        
        const mesh = this.createDuctMesh(elem.shape, elem.size, start, end, false, false, elem.system);
        mesh.userData = { elementId: elem.id };
        this.ductsGroup.add(mesh);
        this.renderedDucts.set(elem.id, mesh);
      } 
      else if (elem.type === "note") {
        // Рендерим 3D пин-маркер для заметки (янтарный шар со светящимся кольцом)
        const markerPos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        const markerGeom = new THREE.SphereGeometry(0.15, 16, 16);
        const markerMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b, // Красивый янтарный
          roughness: 0.1,
          metalness: 0.8,
          emissive: 0x3d2000
        });
        const markerMesh = new THREE.Mesh(markerGeom, markerMat);
        markerMesh.position.copy(markerPos);
        markerMesh.userData = { elementId: elem.id };

        const ringGeom = new THREE.RingGeometry(0.2, 0.25, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.05;
        markerMesh.add(ring);

        this.ductsGroup.add(markerMesh);
        this.renderedDucts.set(elem.id, markerMesh);
      } 
      else if (elem.type === "wall") {
        // Автоматическая привязка дверей и окон без корректного hostWallId к ближайшей стене (до 400 мм)
        for (const op of elements) {
          if (op.type === "door" || op.type === "window") {
            const opPos = new THREE.Vector3(op.position[0] / 1000, op.position[1] / 1000, op.position[2] / 1000);
            const wStart = new THREE.Vector3(elem.start[0] / 1000, elem.start[1] / 1000, elem.start[2] / 1000);
            const wEnd = new THREE.Vector3(elem.end[0] / 1000, elem.end[1] / 1000, elem.end[2] / 1000);
            
            const line = new THREE.Line3(wStart, wEnd);
            const closestPoint = new THREE.Vector3();
            line.closestPointToPoint(opPos, true, closestPoint);
            const dist = opPos.distanceTo(closestPoint);
            
            if (dist < 0.4) {
              const currentHost = op.hostWallId ? elements.find(e => e.id === op.hostWallId) : null;
              if (!currentHost) {
                op.hostWallId = elem.id;
              }
            }
          }
        }

        const start = new THREE.Vector3(elem.start[0] / 1000, elem.start[1] / 1000, elem.start[2] / 1000);
        const end = new THREE.Vector3(elem.end[0] / 1000, elem.end[1] / 1000, elem.end[2] / 1000);
        const H = elem.height / 1000;
        const thickness = elem.thickness / 1000;
        const L = start.distanceTo(end);
        
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        dir.y = 0;
        
        const wallGroup = new THREE.Group();
        
        // Находим все проемы (двери и окна) на этой стене
        const wallOpenings = elements.filter(
          (e) => (e.type === "door" || e.type === "window") && e.hostWallId === elem.id
        );
        
        const spans: { tStart: number; tEnd: number; type: "solid" | "opening"; yLow?: number; yHigh?: number }[] = [];
        
        const openingsData = wallOpenings.map((op) => {
          const opPos = new THREE.Vector3(op.position[0] / 1000, op.position[1] / 1000, op.position[2] / 1000);
          const t = new THREE.Vector3().subVectors(opPos, start).dot(dir);
          const w = (op.width || 900) / 1000;
          const h = (op.height || 2100) / 1000;
          
          let yLow = 0;
          let yHigh = h;
          if (op.type === "window") {
            // Окна центрируются по Y отметке размещения
            yLow = Math.max(0, opPos.y - h/2);
            yHigh = Math.min(H, opPos.y + h/2);
          } else {
            // Двери стоят на полу
            yLow = 0;
            yHigh = Math.min(H, h);
          }
          
          return {
            tStart: Math.max(0, t - w/2),
            tEnd: Math.min(L, t + w/2),
            yLow,
            yHigh,
          };
        });
        
        // Сортируем проемы по координате t вдоль стены
        openingsData.sort((a, b) => a.tStart - b.tStart);
        
        // Строим интервалы (spans) стены
        let currentT = 0;
        for (const op of openingsData) {
          if (op.tStart > currentT + 0.01) {
            spans.push({ tStart: currentT, tEnd: op.tStart, type: "solid" });
          }
          spans.push({
            tStart: op.tStart,
            tEnd: op.tEnd,
            type: "opening",
            yLow: op.yLow,
            yHigh: op.yHigh,
          });
          currentT = op.tEnd;
        }
        if (L > currentT + 0.01) {
          spans.push({ tStart: currentT, tEnd: L, type: "solid" });
        }
        
        const wallMat = new THREE.MeshStandardMaterial({
          color: 0x94a3b8,
          roughness: 0.8,
          metalness: 0.05,
        });
        
        // Если проемов нет, рисуем сплошную стену
        if (spans.length === 0) {
          spans.push({ tStart: 0, tEnd: L, type: "solid" });
        }
        
        for (const span of spans) {
          const spanLength = span.tEnd - span.tStart;
          if (spanLength <= 0.001) continue;
          
          if (span.type === "solid") {
            const geom = new THREE.BoxGeometry(thickness, H, spanLength);
            const mesh = new THREE.Mesh(geom, wallMat);
            
            const horizontalCenter = new THREE.Vector3()
              .copy(start)
              .addScaledVector(dir, (span.tStart + span.tEnd) / 2);
            
            mesh.position.copy(horizontalCenter);
            mesh.position.y += H / 2;
            
            const defaultDir = new THREE.Vector3(0, 0, 1);
            mesh.quaternion.setFromUnitVectors(defaultDir, dir);
            
            mesh.userData = { elementId: elem.id };
            wallGroup.add(mesh);
          } else {
            // Проем: рисуем части стены снизу и сверху от проема
            const horizontalCenter = new THREE.Vector3()
              .copy(start)
              .addScaledVector(dir, (span.tStart + span.tEnd) / 2);
            
            const defaultDir = new THREE.Vector3(0, 0, 1);
            const q = new THREE.Quaternion().setFromUnitVectors(defaultDir, dir);
            
            const yLow = span.yLow || 0;
            const yHigh = span.yHigh || 0;
            
            if (yLow > 0.01) {
              const geomBottom = new THREE.BoxGeometry(thickness, yLow, spanLength);
              const meshBottom = new THREE.Mesh(geomBottom, wallMat);
              meshBottom.position.copy(horizontalCenter);
              meshBottom.position.y += yLow / 2;
              meshBottom.quaternion.copy(q);
              meshBottom.userData = { elementId: elem.id };
              wallGroup.add(meshBottom);
            }
            
            if (yHigh < H - 0.01) {
              const geomTop = new THREE.BoxGeometry(thickness, H - yHigh, spanLength);
              const meshTop = new THREE.Mesh(geomTop, wallMat);
              meshTop.position.copy(horizontalCenter);
              meshTop.position.y += yHigh + (H - yHigh) / 2;
              meshTop.quaternion.copy(q);
              meshTop.userData = { elementId: elem.id };
              wallGroup.add(meshTop);
            }
          }
        }
        
        this.ductsGroup.add(wallGroup);
      }
      else if (elem.type === "tray") {
        const { start, end } = this.getShortenedEndpoints(elem, elements);
        
        const w = elem.width / 1000;
        const h = elem.height / 1000;
        
        const group = new THREE.Group();
        const distance = start.distanceTo(end);
        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        dir.y = 0;
        
        const t = 0.002; // толщина борта 2 мм
        
        const material = new THREE.MeshStandardMaterial({
          color: 0xcbd5e1, // slate-200 (оцинкованная сталь)
          roughness: 0.25,
          metalness: 0.8,
        });
        
        const bottomGeom = new THREE.BoxGeometry(w, t, distance);
        const bottomMesh = new THREE.Mesh(bottomGeom, material);
        bottomMesh.position.set(0, t / 2, 0);
        group.add(bottomMesh);
        
        const leftGeom = new THREE.BoxGeometry(t, h, distance);
        const leftMesh = new THREE.Mesh(leftGeom, material);
        leftMesh.position.set(-w / 2 + t / 2, h / 2, 0);
        group.add(leftMesh);
        
        const rightGeom = new THREE.BoxGeometry(t, h, distance);
        const rightMesh = new THREE.Mesh(rightGeom, material);
        rightMesh.position.set(w / 2 - t / 2, h / 2, 0);
        group.add(rightMesh);
        
        group.position.copy(center);
        const defaultDir = new THREE.Vector3(0, 0, 1);
        group.quaternion.setFromUnitVectors(defaultDir, dir);
        
        bottomMesh.userData = { elementId: elem.id };
        leftMesh.userData = { elementId: elem.id };
        rightMesh.userData = { elementId: elem.id };
        group.userData = { elementId: elem.id };
        
        this.ductsGroup.add(group);
      }
      else if (elem.type === "pipe") {
        const { start, end } = this.getShortenedEndpoints(elem, elements);
        const r = elem.size.d / 2000;
        
        const distance = start.distanceTo(end);
        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        
        const geom = new THREE.CylinderGeometry(r, r, distance, 16);
        const defaultDir = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultDir, dir);
        
        let color = 0x7e8a96;
        let roughness = 0.25;
        let metalness = 0.8;
        
        const sysColorName = (window as any).systemColorSettings?.[elem.system || "ХВС"];
        if (sysColorName && colorNameToHex[sysColorName]) {
          color = colorNameToHex[sysColorName];
        } else {
          if (elem.material === "steel_water") {
            color = 0x475569; // сталь ВГП
          } else if (elem.material === "ppr") {
            color = 0xe2e8f0; // полипропилен белый
            roughness = 0.6;
            metalness = 0.1;
          }
        }
        
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness,
          metalness,
        });
        
        const mesh = new THREE.Mesh(geom, material);
        mesh.position.copy(center);
        mesh.quaternion.copy(quaternion);
        mesh.userData = { elementId: elem.id };
        
        this.ductsGroup.add(mesh);
      }
      else if (elem.type === "fitting") {
        const nodePt = new THREE.Vector3(elem.node[0] / 1000, elem.node[1] / 1000, elem.node[2] / 1000);
        
        // Направление вдоль элемента, считая ОТ узла наружу
        const dirAwayFromNode = (seg: any): THREE.Vector3 => {
          const s = new THREE.Vector3(seg.start[0] / 1000, seg.start[1] / 1000, seg.start[2] / 1000);
          const e = new THREE.Vector3(seg.end[0] / 1000, seg.end[1] / 1000, seg.end[2] / 1000);
          const startIsNode = s.distanceTo(nodePt) < e.distanceTo(nodePt);
          return startIsNode ? e.sub(s).normalize() : s.sub(e).normalize();
        };

        const c = elem.connects.map((id: string) => elements.find((el) => el.id === id)).filter(Boolean);
        const systemType = elem.systemType || "duct";

        // Определяем материал для фитинга
        let mat: THREE.Material;
        if (systemType === "duct") {
          const connectedDuct = c.find((el: any) => el && el.type === "duct");
          const systemName = connectedDuct?.system || "Приточный";
          mat = this.fittingMaterial(systemName);
        } else if (systemType === "pipe") {
          let color = 0x8a95a0;
          let roughness = 0.3;
          let metalness = 0.7;
          if (c[0]?.material === "ppr") {
            color = 0xe2e8f0;
            roughness = 0.6;
            metalness = 0.1;
          }
          mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
        } else { // tray
          mat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.25, metalness: 0.8 });
        }

        if (elem.kind === "bend") {
          let mesh: THREE.Mesh;
          if (systemType === "duct") {
            const isRect = elem.size?.w !== undefined;
            if (!isRect && c.length === 2) {
              const radius = (elem.size?.d || 200) / 2 / 1000;
              mesh = this.createRoundElbow(nodePt, dirAwayFromNode(c[0]), dirAwayFromNode(c[1]), radius, mat);
            } else if (isRect && c.length === 2) {
              mesh = this.createRectElbow(nodePt, dirAwayFromNode(c[0]), dirAwayFromNode(c[1]), elem.size.w / 1000, elem.size.h / 1000, mat);
            } else {
              mesh = new THREE.Mesh(new THREE.SphereGeometry(((elem.size?.d || 200) / 2 / 1000) * 1.05, 16, 16), mat);
            }
          } else if (systemType === "pipe") {
            if (c.length === 2) {
              const radius = (elem.size?.d || 25) / 2 / 1000;
              mesh = this.createRoundElbow(nodePt, dirAwayFromNode(c[0]), dirAwayFromNode(c[1]), radius, mat);
            } else {
              mesh = new THREE.Mesh(new THREE.SphereGeometry(((elem.size?.d || 25) / 2 / 1000) * 1.05, 16, 16), mat);
            }
          } else { // tray
            if (c.length === 2) {
              mesh = this.createRectElbow(nodePt, dirAwayFromNode(c[0]), dirAwayFromNode(c[1]), elem.size.w / 1000, elem.size.h / 1000, mat);
            } else {
              mesh = new THREE.Mesh(new THREE.BoxGeometry((elem.size.w / 1000) * 1.05, (elem.size.h / 1000) * 1.05, (elem.size.w / 1000) * 1.05), mat);
            }
          }
          mesh.userData = { elementId: elem.id };
          mesh.traverse((child) => {
            child.userData.elementId = elem.id;
          });
          this.ductsGroup.add(mesh);
        }
        else if (elem.kind === "tee") {
          let geom: THREE.BufferGeometry;
          if (systemType === "duct") {
            const isRect = elem.size?.w !== undefined;
            geom = isRect
              ? new THREE.BoxGeometry((elem.size.w / 1000) * 1.05, (elem.size.h / 1000) * 1.05, (elem.size.w / 1000) * 1.05)
              : new THREE.SphereGeometry(((elem.size?.d || 200) / 2 / 1000) * 1.1, 16, 16);
          } else if (systemType === "pipe") {
            geom = new THREE.SphereGeometry(((elem.size?.d || 25) / 2 / 1000) * 1.25, 16, 16);
          } else { // tray
            geom = new THREE.BoxGeometry((elem.size.w / 1000) * 1.1, (elem.size.h / 1000) * 1.1, (elem.size.w / 1000) * 1.1);
          }
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.copy(nodePt);
          mesh.userData = { elementId: elem.id };
          this.ductsGroup.add(mesh);
        }
        else if (elem.kind === "reducer") {
          let mesh: THREE.Mesh;
          if (systemType === "duct") {
            const d1 = elements.find((d) => d.id === elem.connects[0]);
            const d2 = elements.find((d) => d.id === elem.connects[1]);
            const length = 0.3;
            if (d1 && d2 && d1.shape !== d2.shape) {
              const rectDuct = d1.shape === "rectangular" ? d1 : d2;
              const roundDuct = d1.shape === "round" ? d1 : d2;
              const axisToRound = dirAwayFromNode(roundDuct);
              mesh = this.createSquareToRound(nodePt, axisToRound, rectDuct.size.w / 1000, rectDuct.size.h / 1000, (roundDuct.size.d || 200) / 1000, length, mat);
            } else if (d1?.shape === "round" || (!d1 && elem.size?.d)) {
              const r1 = (d1?.size.d || elem.size?.d || 200) / 2 / 1000;
              const r2 = (d2?.size.d || 100) / 2 / 1000;
              mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, length, 24), mat);
              const dir = d1 ? dirAwayFromNode(d1).negate() : new THREE.Vector3(0, 1, 0);
              mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            } else {
              const w1 = (d1?.size.w || 300) / 1000, h1 = (d1?.size.h || 200) / 1000;
              const w2 = (d2?.size.w || 200) / 1000, h2 = (d2?.size.h || 150) / 1000;
              mesh = new THREE.Mesh(new THREE.BoxGeometry((w1 + w2) / 2, (h1 + h2) / 2, length), mat);
              const dir = d1 ? dirAwayFromNode(d1).negate() : new THREE.Vector3(0, 0, 1);
              mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
            }
          } else if (systemType === "pipe") {
            const d1 = elements.find((d) => d.id === elem.connects[0]);
            const d2 = elements.find((d) => d.id === elem.connects[1]);
            const length = 0.2;
            const r1 = (d1?.size?.d || elem.size?.d || 25) / 2 / 1000;
            const r2 = (d2?.size?.d || 15) / 2 / 1000;
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, length, 16), mat);
            const dir = d1 ? dirAwayFromNode(d1).negate() : new THREE.Vector3(0, 1, 0);
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          } else { // tray
            const d1 = elements.find((d) => d.id === elem.connects[0]);
            const d2 = elements.find((d) => d.id === elem.connects[1]);
            const length = 0.2;
            const w1 = (d1?.width || elem.size?.w || 200) / 1000, h1 = (d1?.height || elem.size?.h || 80) / 1000;
            const w2 = (d2?.width || 100) / 1000, h2 = (d2?.height || 50) / 1000;
            mesh = new THREE.Mesh(new THREE.BoxGeometry((w1 + w2) / 2, (h1 + h2) / 2, length), mat);
            const dir = d1 ? dirAwayFromNode(d1).negate() : new THREE.Vector3(0, 0, 1);
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
          }
          mesh.position.copy(nodePt);
          mesh.userData = { elementId: elem.id };
          this.ductsGroup.add(mesh);
        }
      }
      else if (elem.type === "terminal") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        let geom: THREE.BufferGeometry;
        
        if (elem.kind === "grille") {
          geom = new THREE.BoxGeometry(0.3, 0.02, 0.2);
        } else {
          geom = new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16);
        }
        
        // Цвет наследуется от воздуховода, если подключен
        let color = 0xcccccc;
        const ductsList = elements.filter(d => d.type === "duct");
        const hostDuct = ductsList.find((d) => d.id === elem.host);
        
        if (hostDuct) {
          const sysColorName = (window as any).systemColorSettings?.[hostDuct.system || "Приточный"] || "синий";
          color = colorNameToHex[sysColorName] || 0xcccccc;
        }
        
        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.5,
          metalness: 0.1,
        });
        
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.copy(pos);
        
        if (hostDuct) {
          const pStart = new THREE.Vector3(hostDuct.start[0] / 1000, hostDuct.start[1] / 1000, hostDuct.start[2] / 1000);
          const pEnd = new THREE.Vector3(hostDuct.end[0] / 1000, hostDuct.end[1] / 1000, hostDuct.end[2] / 1000);
          const dir = new THREE.Vector3().subVectors(pEnd, pStart).normalize();
          
          let quaternion = new THREE.Quaternion();
          if (elem.kind === "grille") {
            const defaultDir = new THREE.Vector3(1, 0, 0);
            quaternion.setFromUnitVectors(defaultDir, dir);
          } else {
            quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0));
          }
          mesh.quaternion.copy(quaternion);
        }
        
        mesh.userData = { elementId: elem.id };
        this.ductsGroup.add(mesh);
      } 
      else if (elem.type === "equipment") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        
        const eqGroup = new THREE.Group();
        eqGroup.position.copy(pos);
        
        const bodyGeom = new THREE.BoxGeometry(1.2, 0.6, 0.6);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: 0x4a5568,
          roughness: 0.4,
          metalness: 0.7,
        });
        const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
        eqGroup.add(bodyMesh);
        
        const bluePortGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 16);
        const bluePortMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.5 });
        const bluePortMesh = new THREE.Mesh(bluePortGeom, bluePortMat);
        bluePortMesh.position.set(-0.6, 0, 0);
        bluePortMesh.rotation.z = Math.PI / 2;
        eqGroup.add(bluePortMesh);
        
        const redPortGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 16);
        const redPortMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 });
        const redPortMesh = new THREE.Mesh(redPortGeom, redPortMat);
        redPortMesh.position.set(0.6, 0, 0);
        redPortMesh.rotation.z = Math.PI / 2;
        eqGroup.add(redPortMesh);
        
        eqGroup.rotation.y = (elem.rotation * Math.PI) / 180;
        bodyMesh.userData = { elementId: elem.id };
        
        this.ductsGroup.add(eqGroup);
      }
      else if (elem.type === "socket") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        const geom = new THREE.BoxGeometry(0.08, 0.08, 0.02);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x10b981, // изумрудный зеленый для розеток
          roughness: 0.5,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.copy(pos);
        
        if (elem.normal) {
          const norm = new THREE.Vector3(elem.normal[0], elem.normal[1], elem.normal[2]);
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), norm);
        }
        mesh.userData = { elementId: elem.id };
        this.ductsGroup.add(mesh);
      }
      else if (elem.type === "panel") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        const geom = new THREE.BoxGeometry(0.4, 0.6, 0.2); // Ш x В x Г
        const mat = new THREE.MeshStandardMaterial({
          color: 0x6b7280, // серый щит
          metalness: 0.8,
          roughness: 0.3,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.copy(pos);
        mesh.rotation.y = (elem.rotation * Math.PI) / 180;
        mesh.userData = { elementId: elem.id };
        this.ductsGroup.add(mesh);
      }
      else if (elem.type === "light") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        const geom = new THREE.BoxGeometry(0.6, 0.05, 0.6); // 600x600 светильник
        const mat = new THREE.MeshStandardMaterial({
          color: 0xfef08a, // тепло-желтый светящийся
          emissive: 0xfef08a,
          emissiveIntensity: 0.5,
          roughness: 0.2,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.copy(pos);
        mesh.userData = { elementId: elem.id };
        this.ductsGroup.add(mesh);
      }
      else if (elem.type === "door") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        const w = (elem.width || 900) / 1000;
        const h = (elem.height || 2100) / 1000;
        
        const doorGroup = new THREE.Group();
        doorGroup.position.copy(pos);
        
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 });
        const frameThickness = 0.04;
        const frameDepth = 0.12;
        
        const leftGeom = new THREE.BoxGeometry(frameDepth, h, frameThickness);
        const leftMesh = new THREE.Mesh(leftGeom, frameMat);
        leftMesh.position.set(0, h / 2, -w / 2 + frameThickness / 2);
        doorGroup.add(leftMesh);
        
        const rightGeom = new THREE.BoxGeometry(frameDepth, h, frameThickness);
        const rightMesh = new THREE.Mesh(rightGeom, frameMat);
        rightMesh.position.set(0, h / 2, w / 2 - frameThickness / 2);
        doorGroup.add(rightMesh);
        
        const topGeom = new THREE.BoxGeometry(frameDepth, frameThickness, w);
        const topMesh = new THREE.Mesh(topGeom, frameMat);
        topMesh.position.set(0, h - frameThickness / 2, 0);
        doorGroup.add(topMesh);
        
        const panelMat = new THREE.MeshStandardMaterial({ color: 0xa0522d, roughness: 0.5 });
        const panelGeom = new THREE.BoxGeometry(0.03, h - frameThickness * 2, w - frameThickness * 2);
        const panelMesh = new THREE.Mesh(panelGeom, panelMat);
        panelMesh.position.set(0.1, h / 2, 0);
        panelMesh.rotation.y = 0.3;
        doorGroup.add(panelMesh);
        
        if (elem.normal) {
          const norm = new THREE.Vector3(elem.normal[0], elem.normal[1], elem.normal[2]);
          doorGroup.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), norm);
        }
        
        leftMesh.userData = { elementId: elem.id };
        rightMesh.userData = { elementId: elem.id };
        topMesh.userData = { elementId: elem.id };
        panelMesh.userData = { elementId: elem.id };
        
        this.ductsGroup.add(doorGroup);
      }
      else if (elem.type === "window") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        const w = (elem.width || 1200) / 1000;
        const h = (elem.height || 1500) / 1000;
        
        const winGroup = new THREE.Group();
        winGroup.position.copy(pos);
        
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
        const frameThickness = 0.05;
        const frameDepth = 0.12;
        
        const leftGeom = new THREE.BoxGeometry(frameDepth, h, frameThickness);
        const leftMesh = new THREE.Mesh(leftGeom, frameMat);
        leftMesh.position.set(0, 0, -w / 2 + frameThickness / 2);
        winGroup.add(leftMesh);
        
        const rightGeom = new THREE.BoxGeometry(frameDepth, h, frameThickness);
        const rightMesh = new THREE.Mesh(rightGeom, frameMat);
        rightMesh.position.set(0, 0, w / 2 - frameThickness / 2);
        winGroup.add(rightMesh);
        
        const topGeom = new THREE.BoxGeometry(frameDepth, frameThickness, w);
        const topMesh = new THREE.Mesh(topGeom, frameMat);
        topMesh.position.set(0, h / 2 - frameThickness / 2, 0);
        winGroup.add(topMesh);
        
        const bottomGeom = new THREE.BoxGeometry(frameDepth, frameThickness, w);
        const bottomMesh = new THREE.Mesh(bottomGeom, frameMat);
        bottomMesh.position.set(0, -h / 2 + frameThickness / 2, 0);
        winGroup.add(bottomMesh);
        
        const glassMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.3,
          roughness: 0.1,
          metalness: 0.9,
        });
        const glassGeom = new THREE.BoxGeometry(0.01, h - frameThickness * 2, w - frameThickness * 2);
        const glassMesh = new THREE.Mesh(glassGeom, glassMat);
        glassMesh.position.set(0, 0, 0);
        winGroup.add(glassMesh);
        
        if (elem.normal) {
          const norm = new THREE.Vector3(elem.normal[0], elem.normal[1], elem.normal[2]);
          winGroup.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), norm);
        }
        
        leftMesh.userData = { elementId: elem.id };
        rightMesh.userData = { elementId: elem.id };
        topMesh.userData = { elementId: elem.id };
        bottomMesh.userData = { elementId: elem.id };
        glassMesh.userData = { elementId: elem.id };
        
        this.ductsGroup.add(winGroup);
      }
      else if (elem.type === "ac") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        
        const acGroup = new THREE.Group();
        acGroup.position.copy(pos);
        
        const acGeom = new THREE.BoxGeometry(0.22, 0.28, 0.85); // Г x В x Ш
        const acMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 });
        const acMesh = new THREE.Mesh(acGeom, acMat);
        acMesh.position.set(0.11, 0, 0);
        acGroup.add(acMesh);
        
        const stripGeom = new THREE.BoxGeometry(0.23, 0.03, 0.8);
        const stripMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
        const stripMesh = new THREE.Mesh(stripGeom, stripMat);
        stripMesh.position.set(0.11, -0.08, 0);
        acGroup.add(stripMesh);
        
        if (elem.normal) {
          const norm = new THREE.Vector3(elem.normal[0], elem.normal[1], elem.normal[2]);
          acGroup.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), norm);
        }
        
        acMesh.userData = { elementId: elem.id };
        stripMesh.userData = { elementId: elem.id };
        
        this.ductsGroup.add(acGroup);
      }
      else if (elem.type === "radiator") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        
        const radGroup = new THREE.Group();
        radGroup.position.copy(pos);
        
        const radGeom = new THREE.BoxGeometry(0.1, 0.6, 0.8); // Г x В x Ш
        const radMat = new THREE.MeshStandardMaterial({
          color: 0xf1f5f9, // белый slate-100
          roughness: 0.4,
          metalness: 0.1,
        });
        const radMesh = new THREE.Mesh(radGeom, radMat);
        radMesh.position.set(0.05, 0, 0); // сдвигаем по X от стены
        radGroup.add(radMesh);
        radMesh.userData = { elementId: elem.id };
        
        const sectionMat = new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          roughness: 0.4,
          metalness: 0.2,
        });
        const numSections = 8;
        for (let i = 0; i < numSections; i++) {
          const zOffset = -0.36 + (i * 0.72) / (numSections - 1);
          const secGeom = new THREE.BoxGeometry(0.11, 0.56, 0.05);
          const secMesh = new THREE.Mesh(secGeom, sectionMat);
          secMesh.position.set(0.05, 0, zOffset);
          radGroup.add(secMesh);
          secMesh.userData = { elementId: elem.id };
        }
        
        if (elem.normal) {
          const norm = new THREE.Vector3(elem.normal[0], elem.normal[1], elem.normal[2]);
          radGroup.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), norm);
        }
        
        this.ductsGroup.add(radGroup);
      }
      else if (elem.type === "ac_ceiling") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        
        const acCeilingGroup = new THREE.Group();
        acCeilingGroup.position.copy(pos);
        
        // Кассетный кондиционер:
        // 1. Декоративная лицевая панель (белая, тонкая, чуть шире корпуса)
        const faceGeom = new THREE.BoxGeometry(0.84, 0.02, 0.84);
        const faceMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
        const faceMesh = new THREE.Mesh(faceGeom, faceMat);
        faceMesh.position.set(0, 0, 0);
        acCeilingGroup.add(faceMesh);
        faceMesh.userData = { elementId: elem.id };
        
        // 2. Основной объемный блок (уходит ВВЕРХ за подвесной потолок на 280 мм)
        const bodyGeom = new THREE.BoxGeometry(0.74, 0.28, 0.74);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5, metalness: 0.2 });
        const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
        bodyMesh.position.set(0, 0.15, 0); // сдвинут вверх по Y, чтобы основная коробка скрывалась в запотолочном пространстве
        acCeilingGroup.add(bodyMesh);
        bodyMesh.userData = { elementId: elem.id };
        
        // 3. Воздухозаборная решетка по центру лицевой панели (снизу)
        const grilleGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.005, 24);
        const grilleMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 }); // slate-600
        const grilleMesh = new THREE.Mesh(grilleGeom, grilleMat);
        grilleMesh.position.set(0, -0.011, 0); // слегка выступает снизу для реалистичного объема
        acCeilingGroup.add(grilleMesh);
        grilleMesh.userData = { elementId: elem.id };
        
        // 4. Четыре щелевых воздухораспределителя по краям панели
        const slotMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
        
        // Щели по 4 направлениям
        const slot1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.001, 0.03), slotMat);
        slot1.position.set(0, -0.0101, 0.3);
        acCeilingGroup.add(slot1);
        slot1.userData = { elementId: elem.id };
        
        const slot2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.001, 0.03), slotMat);
        slot2.position.set(0, -0.0101, -0.3);
        acCeilingGroup.add(slot2);
        slot2.userData = { elementId: elem.id };
        
        const slot3 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.001, 0.6), slotMat);
        slot3.position.set(0.3, -0.0101, 0);
        acCeilingGroup.add(slot3);
        slot3.userData = { elementId: elem.id };
        
        const slot4 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.001, 0.6), slotMat);
        slot4.position.set(-0.3, -0.0101, 0);
        acCeilingGroup.add(slot4);
        slot4.userData = { elementId: elem.id };
        
        acCeilingGroup.rotation.y = (elem.rotation * Math.PI) / 180;
        
        this.ductsGroup.add(acCeilingGroup);
      }
      else if (elem.type === "toilet") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        
        const toiletGroup = new THREE.Group();
        toiletGroup.position.copy(pos);
        
        // Керамика и пластик
        const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }); // белый глянец
        const lidMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 }); // серый пластик
        
        // 1. Сливной бачок
        const tankGeom = new THREE.BoxGeometry(0.2, 0.4, 0.38);
        const tankMesh = new THREE.Mesh(tankGeom, ceramicMat);
        tankMesh.position.set(0.1, 0.6, 0); // смещен от стены и поднят
        toiletGroup.add(tankMesh);
        tankMesh.userData = { elementId: elem.id };
        
        // 2. Чаша унитаза
        const bowlGeom = new THREE.BoxGeometry(0.48, 0.4, 0.36);
        const bowlMesh = new THREE.Mesh(bowlGeom, ceramicMat);
        bowlMesh.position.set(0.44, 0.2, 0);
        toiletGroup.add(bowlMesh);
        bowlMesh.userData = { elementId: elem.id };
        
        // 3. Крышка
        const lidGeom = new THREE.BoxGeometry(0.46, 0.02, 0.34);
        const lidMesh = new THREE.Mesh(lidGeom, lidMat);
        lidMesh.position.set(0.45, 0.41, 0);
        toiletGroup.add(lidMesh);
        lidMesh.userData = { elementId: elem.id };
        
        if (elem.normal) {
          const norm = new THREE.Vector3(elem.normal[0], elem.normal[1], elem.normal[2]);
          toiletGroup.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), norm);
        }
        
        this.ductsGroup.add(toiletGroup);
      }
      else if (elem.type === "sink") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        
        const sinkGroup = new THREE.Group();
        sinkGroup.position.copy(pos);
        
        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
        const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.1, metalness: 0.9 }); // хром
        
        // 1. Раковина
        const basinGeom = new THREE.BoxGeometry(0.45, 0.18, 0.55);
        const basinMesh = new THREE.Mesh(basinGeom, whiteMat);
        basinMesh.position.set(0.225, 0, 0);
        sinkGroup.add(basinMesh);
        basinMesh.userData = { elementId: elem.id };
        
        // 2. Кран-смеситель
        const tapGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.1, 12);
        const tapMesh = new THREE.Mesh(tapGeom, chromeMat);
        tapMesh.position.set(0.06, 0.14, 0);
        sinkGroup.add(tapMesh);
        tapMesh.userData = { elementId: elem.id };
        
        const spoutGeom = new THREE.BoxGeometry(0.08, 0.015, 0.02);
        const spoutMesh = new THREE.Mesh(spoutGeom, chromeMat);
        spoutMesh.position.set(0.1, 0.18, 0);
        sinkGroup.add(spoutMesh);
        spoutMesh.userData = { elementId: elem.id };
        
        if (elem.normal) {
          const norm = new THREE.Vector3(elem.normal[0], elem.normal[1], elem.normal[2]);
          sinkGroup.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), norm);
        }
        
        this.ductsGroup.add(sinkGroup);
      }
      else if (elem.type === "workstation") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        
        const wsGroup = new THREE.Group();
        wsGroup.position.copy(pos);
        
        // ---- Материалы ----
        const deskMat = new THREE.MeshStandardMaterial({ color: 0xd4a96a, roughness: 0.6 }); // дерево
        const legMat  = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.3, metalness: 0.8 }); // металл
        const monMat  = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 }); // чёрный
        const screenMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x1d4ed8, emissiveIntensity: 0.3, roughness: 0.1 }); // экран
        const chairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 }); // кресло
        const kbMat   = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 }); // клавиатура
        
        // ---- СТОЛ ----
        // Столешница 1600 x 750 x 25 мм → 1.6 x 0.025 x 0.75
        const topGeom = new THREE.BoxGeometry(1.6, 0.025, 0.75);
        const topMesh = new THREE.Mesh(topGeom, deskMat);
        topMesh.position.set(0, 0.7125, 0); // 700 мм + половина столешницы
        topMesh.userData = { elementId: elem.id };
        wsGroup.add(topMesh);
        
        // 4 ножки стола (50x50x700 мм)
        const legPositions = [
          [-0.75, 0.35, -0.35], [ 0.75, 0.35, -0.35],
          [-0.75, 0.35,  0.35], [ 0.75, 0.35,  0.35],
        ];
        legPositions.forEach(([lx, ly, lz]) => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), legMat);
          leg.position.set(lx, ly, lz);
          leg.userData = { elementId: elem.id };
          wsGroup.add(leg);
        });
        
        // ---- МОНИТОР (27") ----
        // Подставка монитора
        const mStandGeom = new THREE.BoxGeometry(0.22, 0.02, 0.18);
        const mStand = new THREE.Mesh(mStandGeom, legMat);
        mStand.position.set(0, 0.735, -0.25);
        mStand.userData = { elementId: elem.id };
        wsGroup.add(mStand);
        
        // Ножка-стойка монитора
        const mNeckGeom = new THREE.BoxGeometry(0.025, 0.28, 0.025);
        const mNeck = new THREE.Mesh(mNeckGeom, legMat);
        mNeck.position.set(0, 0.875, -0.25);
        mNeck.userData = { elementId: elem.id };
        wsGroup.add(mNeck);
        
        // Корпус монитора
        const mBodyGeom = new THREE.BoxGeometry(0.62, 0.38, 0.04);
        const mBody = new THREE.Mesh(mBodyGeom, monMat);
        mBody.position.set(0, 1.08, -0.25);
        mBody.userData = { elementId: elem.id };
        wsGroup.add(mBody);
        
        // Экран монитора
        const mScreenGeom = new THREE.BoxGeometry(0.58, 0.34, 0.005);
        const mScreen = new THREE.Mesh(mScreenGeom, screenMat);
        mScreen.position.set(0, 1.08, -0.228);
        mScreen.userData = { elementId: elem.id };
        wsGroup.add(mScreen);
        
        // ---- СИСТЕМНЫЙ БЛОК (под столом справа) ----
        const pcGeom = new THREE.BoxGeometry(0.2, 0.42, 0.44);
        const pcMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5 });
        const pcMesh = new THREE.Mesh(pcGeom, pcMat);
        pcMesh.position.set(0.68, 0.21, 0.15);
        pcMesh.userData = { elementId: elem.id };
        wsGroup.add(pcMesh);
        
        // ---- КЛАВИАТУРА ----
        const kbGeom = new THREE.BoxGeometry(0.44, 0.02, 0.14);
        const kbMesh = new THREE.Mesh(kbGeom, kbMat);
        kbMesh.position.set(0, 0.728, 0.1);
        kbMesh.userData = { elementId: elem.id };
        wsGroup.add(kbMesh);
        
        // ---- МЫШЬ ----
        const mouseGeom = new THREE.BoxGeometry(0.06, 0.025, 0.11);
        const mouseMesh = new THREE.Mesh(mouseGeom, kbMat);
        mouseMesh.position.set(0.32, 0.728, 0.1);
        mouseMesh.userData = { elementId: elem.id };
        wsGroup.add(mouseMesh);
        
        // ---- КРЕСЛО (позади стола на 0.6м) ----
        // Сиденье
        const seatGeom = new THREE.BoxGeometry(0.5, 0.06, 0.48);
        const seatMesh = new THREE.Mesh(seatGeom, chairMat);
        seatMesh.position.set(0, 0.46, 0.55);
        seatMesh.userData = { elementId: elem.id };
        wsGroup.add(seatMesh);
        
        // Спинка
        const backGeom = new THREE.BoxGeometry(0.46, 0.52, 0.06);
        const backMesh = new THREE.Mesh(backGeom, chairMat);
        backMesh.position.set(0, 0.75, 0.78);
        backMesh.userData = { elementId: elem.id };
        wsGroup.add(backMesh);
        
        // Газлифт + крестовина (упрощённо)
        const gasGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.45, 8);
        const gasMesh = new THREE.Mesh(gasGeom, legMat);
        gasMesh.position.set(0, 0.225, 0.55);
        gasMesh.userData = { elementId: elem.id };
        wsGroup.add(gasMesh);
        
        // 5 лучей крестовины кресла
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2;
          const rayGeom = new THREE.BoxGeometry(0.38, 0.02, 0.04);
          const rayMesh = new THREE.Mesh(rayGeom, legMat);
          rayMesh.position.set(Math.cos(angle) * 0.19, 0.02, 0.55 + Math.sin(angle) * 0.19);
          rayMesh.rotation.y = -angle;
          rayMesh.userData = { elementId: elem.id };
          wsGroup.add(rayMesh);
        }
        
        // Поворот рабочего места
        wsGroup.rotation.y = (elem.rotation * Math.PI) / 180;
        
        this.ductsGroup.add(wsGroup);
      }
      else if (elem.type === "column") {
        const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
        
        const columnGroup = new THREE.Group();
        columnGroup.position.copy(pos);
        
        const colMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.7 }); // Бетон
        const colGeom = new THREE.BoxGeometry(0.4, 3.0, 0.4); // 400x400x3000 мм
        const colMesh = new THREE.Mesh(colGeom, colMat);
        colMesh.position.set(0, 0, 0);
        colMesh.userData = { elementId: elem.id };
        columnGroup.add(colMesh);
        
        // Декоративные шапки (для премиальности)
        const capMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.5 }); // графитовый серый
        
        const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.44), capMat);
        topCap.position.set(0, 1.5, 0);
        topCap.userData = { elementId: elem.id };
        columnGroup.add(topCap);
        
        const botCap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.44), capMat);
        botCap.position.set(0, -1.5, 0);
        botCap.userData = { elementId: elem.id };
        columnGroup.add(botCap);
        
        // Поворот колонны
        columnGroup.rotation.y = (elem.rotation * Math.PI) / 180;
        
        this.ductsGroup.add(columnGroup);
      }
    }
  }

  // --- BaseLineTool Implementation ---

  protected updatePreview(start: THREE.Vector3, end: THREE.Vector3, isInvalidAngle: boolean) {
    this.removePreview();
    
    this.previewMesh = this.createDuctMesh(
      this.activeParams.shape,
      this.activeParams.size,
      start,
      end,
      true, // isPreview
      isInvalidAngle,
      this.activeParams.system
    );
    
    this.world.scene.three.add(this.previewMesh);
  }

  protected removePreview() {
    if (this.previewMesh) {
      this.previewMesh.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.world.scene.three.remove(this.previewMesh);
      this.previewMesh = null;
    }
  }

  protected saveSegment(start: THREE.Vector3, end: THREE.Vector3) {
    const id = `duct-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    
    const duct: DuctElement = {
      id,
      type: "duct",
      shape: this.activeParams.shape,
      size: { ...this.activeParams.size },
      start: [start.x * 1000, start.y * 1000, start.z * 1000],
      end: [end.x * 1000, end.y * 1000, end.z * 1000],
      sortamentRef: this.activeParams.sortamentRef,
      material: this.activeParams.material,
      system: this.activeParams.system
    };
    
    this.projectElements.push(duct);
    
    // Автогенерация фасонных частей
    const updatedElements = FittingGenerator.generateFittings(this.projectElements);
    this.projectElements.length = 0;
    this.projectElements.push(...updatedElements);
    
    this.renderAll(this.projectElements);
    this.onElementsUpdated();
    
    console.log("Duct segment saved and fittings updated.");
  }

  // --- Geometry Helpers ---

  private createDuctMesh(
    shape: "round" | "rectangular",
    size: { d?: number; w?: number; h?: number },
    start: THREE.Vector3,
    end: THREE.Vector3,
    isPreview = false,
    isInvalidAngle = false,
    system?: string
  ): THREE.Mesh {
    const distance = start.distanceTo(end);
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    
    let geom: THREE.BufferGeometry;
    let quaternion = new THREE.Quaternion();
    
    if (shape === "round") {
      const radius = (size.d || 200) / 2 / 1000;
      geom = new THREE.CylinderGeometry(radius, radius, distance, 16);
      
      const defaultDir = new THREE.Vector3(0, 1, 0);
      quaternion.setFromUnitVectors(defaultDir, dir);
    } else {
      const w = (size.w || 300) / 1000;
      const h = (size.h || 200) / 1000;
      geom = new THREE.BoxGeometry(w, h, distance);
      
      const defaultDir = new THREE.Vector3(0, 0, 1);
      quaternion.setFromUnitVectors(defaultDir, dir);
    }
    
    const sysColorName = (window as any).systemColorSettings?.[system || "Приточный"] || "синий";
    const hex = colorNameToHex[sysColorName] || 0x7e8a96;
    
    const material = new THREE.MeshStandardMaterial({
      color: isPreview ? (isInvalidAngle ? 0xef4444 : 0x00aaff) : hex,
      roughness: isPreview ? 0.3 : 0.25,
      metalness: isPreview ? 0.1 : 0.8,
      transparent: isPreview,
      opacity: isPreview ? 0.6 : 1.0,
    });
    
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.copy(center);
    mesh.quaternion.copy(quaternion);
    
    return mesh;
  }

  private fittingMaterial(system?: string): THREE.MeshStandardMaterial {
    let color = 0x8a95a0;
    if (system) {
      const sysColorName = (window as any).systemColorSettings?.[system] || "синий";
      color = colorNameToHex[sysColorName] || 0x8a95a0;
    }
    return new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 });
  }

  private createRoundElbow(
    node: THREE.Vector3,
    dirA: THREE.Vector3,
    dirB: THREE.Vector3,
    radius: number,
    mat: THREE.Material
  ): THREE.Mesh {
    const off = Math.max(radius * 1.5, 0.12);
    const pA = node.clone().addScaledVector(dirA, off);
    const pB = node.clone().addScaledVector(dirB, off);
    const curve = new THREE.QuadraticBezierCurve3(pA, node.clone(), pB);
    const geom = new THREE.TubeGeometry(curve, 16, radius, 20, false);
    return new THREE.Mesh(geom, mat);
  }

  private createRectElbow(
    node: THREE.Vector3,
    dirA: THREE.Vector3,
    dirB: THREE.Vector3,
    w: number,
    h: number,
    mat: THREE.Material
  ): THREE.Mesh {
    // Двухсегментный Г-образный отвод для прямоугольных каналов.
    // Каждый сегмент начинается точно там, где заканчивается укороченный воздуховод,
    // и идет до узла (node), полностью исключая зазоры и предотвращая любые перевороты сечений (w ↔ h).
    const off = Math.max(Math.max(w, h) * 1.2, 0.15);

    // Создаем родительский меш с пустой геометрией, но с большим boundingSphere для надежного raycast
    const parentGeom = new THREE.BufferGeometry();
    parentGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), off * 2);
    const parentMesh = new THREE.Mesh(parentGeom, mat);
    parentMesh.position.copy(node);

    // Вспомогательный вектор направления для осей BoxGeometry в Three.js (ось Z по умолчанию)
    const defaultDir = new THREE.Vector3(0, 0, 1);

    // Сегмент А (от node + dirA * off до node)
    const geomA = new THREE.BoxGeometry(w, h, off);
    const meshA = new THREE.Mesh(geomA, mat);
    meshA.position.copy(dirA).multiplyScalar(off / 2);
    meshA.quaternion.setFromUnitVectors(defaultDir, dirA);
    parentMesh.add(meshA);

    // Сегмент Б (от node + dirB * off до node)
    const geomB = new THREE.BoxGeometry(w, h, off);
    const meshB = new THREE.Mesh(geomB, mat);
    meshB.position.copy(dirB).multiplyScalar(off / 2);
    meshB.quaternion.setFromUnitVectors(defaultDir, dirB);
    parentMesh.add(meshB);

    return parentMesh;
  }

  private getShortenedEndpoints(elem: any, elements: any[]) {
    const start = new THREE.Vector3(elem.start[0] / 1000, elem.start[1] / 1000, elem.start[2] / 1000);
    const end = new THREE.Vector3(elem.end[0] / 1000, elem.end[1] / 1000, elem.end[2] / 1000);
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    
    let newStart = start.clone();
    let newEnd = end.clone();
    
    const fittings = elements.filter(e => e.type === "fitting");
    
    for (const fit of fittings) {
      const nodePt = new THREE.Vector3(fit.node[0] / 1000, fit.node[1] / 1000, fit.node[2] / 1000);
      
      const isConnected = fit.connects && fit.connects.includes(elem.id);
      if (!isConnected) continue;
      
      const distToStart = nodePt.distanceTo(start);
      const distToEnd = nodePt.distanceTo(end);
      
      if (distToStart < 0.05) {
        let off = 0.15;
        if (fit.kind === "bend") {
          if (elem.shape === "round" || elem.type === "pipe") {
            const radius = ((elem.size?.d || 200) / 2) / 1000;
            off = Math.max(radius * 1.5, 0.12);
          } else {
            const w = (elem.size?.w || elem.width || 300) / 1000;
            const h = (elem.size?.h || elem.height || 200) / 1000;
            off = Math.max(Math.max(w, h) * 1.2, 0.15);
          }
        } else if (fit.kind === "reducer") {
          off = 0.15;
        } else if (fit.kind === "tee") {
          if (elem.shape === "round" || elem.type === "pipe") {
            off = ((elem.size?.d || 200) / 2) / 1000 * 1.1;
          } else {
            off = ((elem.size?.w || elem.width || 300) / 2) / 1000 * 1.05;
          }
        }
        newStart.addScaledVector(dir, off);
      } else if (distToEnd < 0.05) {
        let off = 0.15;
        if (fit.kind === "bend") {
          if (elem.shape === "round" || elem.type === "pipe") {
            const radius = ((elem.size?.d || 200) / 2) / 1000;
            off = Math.max(radius * 1.5, 0.12);
          } else {
            const w = (elem.size?.w || elem.width || 300) / 1000;
            const h = (elem.size?.h || elem.height || 200) / 1000;
            off = Math.max(Math.max(w, h) * 1.2, 0.15);
          }
        } else if (fit.kind === "reducer") {
          off = 0.15;
        } else if (fit.kind === "tee") {
          if (elem.shape === "round" || elem.type === "pipe") {
            off = ((elem.size?.d || 200) / 2) / 1000 * 1.1;
          } else {
            off = ((elem.size?.w || elem.width || 300) / 2) / 1000 * 1.05;
          }
        }
        newEnd.addScaledVector(dir, -off);
      }
    }
    
    const originalLength = start.distanceTo(end);
    const newLength = newStart.distanceTo(newEnd);
    if (newLength < 0.02 || newStart.clone().sub(start).length() + end.clone().sub(newEnd).length() > originalLength) {
      return { start, end };
    }
    
    return { start: newStart, end: newEnd };
  }

  private createSquareToRound(
    node: THREE.Vector3,
    axisToRound: THREE.Vector3,
    w: number,
    h: number,
    d: number,
    length: number,
    mat: THREE.Material
  ): THREE.Mesh {
    const segments = 32;
    const r = d / 2;
    const hw = w / 2;
    const hh = h / 2;
    const zRect = -length / 2;
    const zRound = length / 2;

    const positions: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);

      const cx = r * ct;
      const cy = r * st;

      const scale = 1 / Math.max(Math.abs(ct) / hw, Math.abs(st) / hh);
      const rx = ct * scale;
      const ry = st * scale;

      positions.push(rx, ry, zRect);
      positions.push(cx, cy, zRound);
    }

    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const next = ((i + 1) % segments) * 2;
      const c = next;
      const dd = next + 1;
      indices.push(a, b, dd);
      indices.push(a, dd, c);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, mat);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axisToRound.clone().normalize());
    mesh.position.copy(node);
    return mesh;
  }

  protected inheritParameters(elem: any) {
    if (elem.type === "duct") {
      this.activeParams.shape = elem.shape;
      this.activeParams.size = { ...elem.size };
      this.activeParams.sortamentRef = elem.sortamentRef;
      this.activeParams.material = elem.material;
      this.activeParams.system = elem.system;
      this.activeParams.elevation = elem.start[1];

      window.dispatchEvent(new CustomEvent("tool-params-sync", { detail: {
        toolType: "duct",
        shape: elem.shape,
        sortamentRef: elem.sortamentRef,
        material: elem.material,
        system: elem.system,
        elevation: elem.start[1]
      }}));
      console.log("Duct params inherited:", this.activeParams);
    }
  }
}
