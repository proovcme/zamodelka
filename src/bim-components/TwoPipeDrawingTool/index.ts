import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { BaseLineTool } from "../BaseLineTool";
import { FittingGenerator } from "../FittingGenerator";

export interface PipeElement {
  id: string;
  type: "pipe";
  start: [number, number, number]; // в мм
  end: [number, number, number];   // в мм
  size: { d: number };             // диаметр в мм
  material: "steel_water" | "ppr";
  system: string;
  sortamentRef: string;
  pairId?: string;                 // Идентификатор пары подача-обратка
  role?: "supply" | "return";      // Роль трубы в паре
}

export class TwoPipeDrawingTool extends BaseLineTool {
  activeParams = {
    d: 25,                         // диаметр в мм
    material: "steel_water" as "steel_water" | "ppr",
    spacing: 150,                  // расстояние между осями труб в мм
    elevation: 0,                  // в мм
    systemSupply: "Подача",
    systemReturn: "Обратка",
    sortamentRef: "PIPE-25",
  };

  private _activeType: "heating" | "cooling" = "heating";
  private _layoutMode: "wall" | "free" = "wall";
  wallSnapActive = false;

  get activeType(): "heating" | "cooling" {
    return this._activeType;
  }

  set activeType(value: "heating" | "cooling") {
    this._activeType = value;
    this.enableWallSnapping = (value === "heating" && this._layoutMode === "wall");
  }

  get layoutMode(): "wall" | "free" {
    return this._layoutMode;
  }

  set layoutMode(value: "wall" | "free") {
    this._layoutMode = value;
    this.enableWallSnapping = (this._activeType === "heating" && value === "wall");
  }

  private dockedPorts: { supply: THREE.Vector3; return: THREE.Vector3 } | null = null;

  constructor(components: OBC.Components, world: OBC.World) {
    super(components, world);
    this.enableWallSnapping = true; // авто: рядом со стеной ведем по грани, вдали остаемся свободными
    this.wallFaceOffset = 40; // буквально по стене (40 мм от грани)
  }

  // Вспомогательный метод для получения мировых координат портов оборудования
  private getEquipmentPorts(elem: any): { supply: THREE.Vector3; return: THREE.Vector3 } | null {
    let localSupply: [number, number, number] | null = null;
    let localReturn: [number, number, number] | null = null;

    if (elem.type === "equipment") {
      localSupply = [600, 0, 0];
      localReturn = [-600, 0, 0];
    } else if (elem.type === "radiator") {
      localSupply = [50, -250, 310];
      localReturn = [50, -250, 360];
    } else if (elem.type === "ac") {
      localSupply = [110, -100, 150];
      localReturn = [110, -100, 200];
    } else if (elem.type === "ac_ceiling") {
      localSupply = [370, 150, -50];
      localReturn = [370, 150, 50];
    } else if (elem.type === "vrv_outdoor") {
      localSupply = [-400, 200, 200];
      localReturn = [-400, 200, -200];
    }

    if (!localSupply || !localReturn) return null;

    const pos = new THREE.Vector3(elem.position[0] / 1000, elem.position[1] / 1000, elem.position[2] / 1000);
    const q = new THREE.Quaternion();

    if (elem.rotation !== undefined) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (elem.rotation * Math.PI) / 180);
    } else if (elem.normal) {
      const norm = new THREE.Vector3(elem.normal[0], elem.normal[1], elem.normal[2]);
      q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), norm);
    }

    const supplyWorld = new THREE.Vector3(localSupply[0] / 1000, localSupply[1] / 1000, localSupply[2] / 1000)
      .applyQuaternion(q)
      .add(pos);

    const returnWorld = new THREE.Vector3(localReturn[0] / 1000, localReturn[1] / 1000, localReturn[2] / 1000)
      .applyQuaternion(q)
      .add(pos);

    return { supply: supplyWorld, return: returnWorld };
  }

  // Метод проверки наличия дока (автодок) в радиусе 300мм
  private checkAutoDock(point: THREE.Vector3) {
    const dockThreshold = 0.3; // 300 мм
    this.dockedPorts = null;

    for (const elem of this.projectElements) {
      if (["equipment", "radiator", "ac", "ac_ceiling"].includes(elem.type)) {
        const ports = this.getEquipmentPorts(elem);
        if (ports) {
          const midPoint = new THREE.Vector3().addVectors(ports.supply, ports.return).multiplyScalar(0.5);
          if (point.distanceTo(midPoint) < dockThreshold) {
            this.dockedPorts = ports;
            break;
          }
        }
      }
    }
  }

  // Привязка точки к ГРАНИ ближайшей стены (ось + полутолщина + отступ 40мм),
  // а не к оси. Только в режиме «По стене» для отопления. Иначе точка без изменений.
  private snapToWallFace(point: THREE.Vector3): THREE.Vector3 {
    if (!(this.activeType === "heating" && this._layoutMode === "wall")) return point;
    let best: THREE.Vector3 | null = null;
    let minDist = 0.4; // 400 мм порог
    for (const elem of this.projectElements) {
      if (elem.type !== "wall" || !elem.start || !elem.end) continue;
      const wStart = new THREE.Vector3(elem.start[0] / 1000, point.y, elem.start[2] / 1000);
      const wEnd = new THREE.Vector3(elem.end[0] / 1000, point.y, elem.end[2] / 1000);
      const wallDir = new THREE.Vector3().subVectors(wEnd, wStart).normalize();
      const len = wStart.distanceTo(wEnd);
      let t = new THREE.Vector3().subVectors(point, wStart).dot(wallDir);
      t = Math.max(0, Math.min(len, t));
      const proj = wStart.clone().addScaledVector(wallDir, t);
      const dist = point.distanceTo(proj);
      if (dist < minDist) {
        minDist = dist;
        const perp = new THREE.Vector3(-wallDir.z, 0, wallDir.x).normalize();
        const side = new THREE.Vector3().subVectors(point, proj).dot(perp) >= 0 ? 1 : -1;
        const thickness = elem.thickness || 200;
        const off = (thickness / 2 + this.wallFaceOffset) / 1000;
        best = proj.clone().addScaledVector(perp, side * off);
        best.y = point.y;
      }
    }
    return best || point;
  }

  private drawPreviewPath(
    group: THREE.Group,
    start: THREE.Vector3,
    pathPoints: THREE.Vector3[],
    r: number,
    colorHex: number,
    isInvalidAngle: boolean
  ) {
    let current = start;
    pathPoints.forEach((pt) => {
      if (current.distanceTo(pt) > 0.01) {
        const mesh = this.createPipePreviewMesh(current, pt, r, colorHex, isInvalidAngle);
        group.add(mesh);
        current = pt;
      }
    });
  }

  private createWallSnapIndicator(start: THREE.Vector3, end: THREE.Vector3, isInvalidAngle: boolean) {
    const distance = start.distanceTo(end);
    if (distance < 0.01) return null;

    const indicatorStart = start.clone();
    const indicatorEnd = end.clone();
    indicatorStart.y += 0.018;
    indicatorEnd.y += 0.018;

    const center = new THREE.Vector3().addVectors(indicatorStart, indicatorEnd).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(indicatorEnd, indicatorStart).normalize();
    const geom = new THREE.CylinderGeometry(0.028, 0.028, distance, 16);
    geom.rotateX(Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      color: isInvalidAngle ? 0xef4444 : 0x22d3ee,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geom, material);
    mesh.position.copy(center);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    return mesh;
  }

  protected updatePreview(start: THREE.Vector3, end: THREE.Vector3, isInvalidAngle: boolean) {
    this.removePreview();

    // Прижимаем точку к грани стены (а не к оси) в режиме «По стене»
    end = this.snapToWallFace(end);

    const group = new THREE.Group();
    const halfSpacing = this.activeParams.spacing / 2 / 1000;
    const r = this.activeParams.d / 2000;
    const floorY = start.y;

    // Resolve colors based on system type
    let supplyColor = 0xef4444; // красный
    let returnColor = 0x3b82f6; // синий
    if (this._activeType === "cooling") {
      supplyColor = 0xf97316; // оранжевый
      returnColor = 0x06b6d4; // бирюзовый
    }

    // Check if we are close to a wall
    let isWallSnapped = false;
    if (this.activeType === "heating" && this._layoutMode === "wall") {
      for (const elem of this.projectElements) {
        if (elem.type === "wall" && elem.start && elem.end) {
          const wStart = new THREE.Vector3(elem.start[0] / 1000, end.y, elem.start[2] / 1000);
          const wEnd = new THREE.Vector3(elem.end[0] / 1000, end.y, elem.end[2] / 1000);
          const wallDir = new THREE.Vector3().subVectors(wEnd, wStart).normalize();
          const toPoint = new THREE.Vector3().subVectors(end, wStart);
          const len = wStart.distanceTo(wEnd);
          let t = toPoint.dot(wallDir);
          t = Math.max(0, Math.min(len, t));
          const proj = wStart.clone().addScaledVector(wallDir, t);
          if (end.distanceTo(proj) < 0.4) {
            isWallSnapped = true;
            break;
          }
        }
      }
    }
    this.wallSnapActive = isWallSnapped;

    if (isWallSnapped) {
      const snapIndicator = this.createWallSnapIndicator(start, end, isInvalidAngle);
      if (snapIndicator) group.add(snapIndicator);

      // Stacked vertically: supply on top (105mm), return on bottom (50mm)
      const ySupply = floorY + 0.105;
      const yReturn = floorY + 0.05;

      const startSupply = start.clone(); startSupply.y = ySupply;
      const endSupply = end.clone(); endSupply.y = ySupply;

      const startReturn = start.clone(); startReturn.y = yReturn;
      const endReturn = end.clone(); endReturn.y = yReturn;

      // Find crossed radiators
      const dir = new THREE.Vector3().subVectors(end, start);
      const len = dir.length();
      const dirNorm = dir.clone().normalize();

      const crossedRadiators: { elem: any; t: number; ports: any }[] = [];

      for (const elem of this.projectElements) {
        if (elem.type === "radiator") {
          const ports = this.getEquipmentPorts(elem);
          if (ports) {
            // Project ports.supply horizontally
            const u = ports.supply.clone().sub(start);
            u.y = 0;
            const t = u.dot(dirNorm);
            if (t > 0.05 && t < len - 0.05) {
              const proj = start.clone().addScaledVector(dirNorm, t);
              proj.y = ports.supply.y;
              if (ports.supply.distanceTo(proj) < 0.3) {
                crossedRadiators.push({ elem, t, ports });
              }
            }
          }
        }
      }

      // Sort by t ascending
      crossedRadiators.sort((a, b) => a.t - b.t);

      if (crossedRadiators.length > 0) {
        // Draw supply path through crossed radiators in preview
        let currentSupply = startSupply.clone();
        crossedRadiators.forEach((item) => {
          const Proj_supply = startSupply.clone().addScaledVector(dirNorm, item.t);
          const Proj_supply_elev = Proj_supply.clone();
          Proj_supply_elev.y = item.ports.supply.y;

          // Main horizontal pipe segment leading to this radiator's branch
          this.drawPreviewPath(group, currentSupply, [Proj_supply], r, supplyColor, isInvalidAngle);

          // Perpendicular branch connections (vertical and horizontal)
          this.drawPreviewPath(group, Proj_supply, [Proj_supply_elev, item.ports.supply], r, supplyColor, isInvalidAngle);

          currentSupply.copy(Proj_supply);
        });
        // Final segment to end
        this.drawPreviewPath(group, currentSupply, [endSupply], r, supplyColor, isInvalidAngle);

        // Draw return path through crossed radiators in preview
        let currentReturn = startReturn.clone();
        crossedRadiators.forEach((item) => {
          const Proj_return = startReturn.clone().addScaledVector(dirNorm, item.t);
          const Proj_return_elev = Proj_return.clone();
          Proj_return_elev.y = item.ports.return.y;

          // Main horizontal pipe segment leading to this radiator's branch
          this.drawPreviewPath(group, currentReturn, [Proj_return], r, returnColor, isInvalidAngle);

          // Perpendicular branch connections (vertical and horizontal)
          this.drawPreviewPath(group, Proj_return, [Proj_return_elev, item.ports.return], r, returnColor, isInvalidAngle);

          currentReturn.copy(Proj_return);
        });
        // Final segment to end
        this.drawPreviewPath(group, currentReturn, [endReturn], r, returnColor, isInvalidAngle);
      } else {
        // Just draw a single straight segment for supply and return in preview
        this.drawPreviewPath(group, startSupply, [endSupply], r, supplyColor, isInvalidAngle);
        this.drawPreviewPath(group, startReturn, [endReturn], r, returnColor, isInvalidAngle);
      }
    } else {
      // Normal horizontal parallel segment (e.g. cooling or heating away from walls)
      this.checkAutoDock(end);

      const dir = new THREE.Vector3().subVectors(end, start).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

      let startSupply = start.clone();
      let startReturn = start.clone();
      if (this.lastSegmentDir) {
        const prevPerp = new THREE.Vector3(-this.lastSegmentDir.z, 0, this.lastSegmentDir.x).normalize();
        startSupply.addScaledVector(prevPerp, halfSpacing);
        startReturn.addScaledVector(prevPerp, -halfSpacing);
      } else {
        startSupply.addScaledVector(perp, halfSpacing);
        startReturn.addScaledVector(perp, -halfSpacing);
      }

      if (this.dockedPorts) {
        const P_supply = this.dockedPorts.supply;
        const P_return = this.dockedPorts.return;

        const u_supply = P_supply.clone().sub(startSupply);
        u_supply.y = 0;
        const t_supply = u_supply.dot(dir);
        const Proj_supply = startSupply.clone().addScaledVector(dir, t_supply);

        const u_return = P_return.clone().sub(startReturn);
        u_return.y = 0;
        const t_return = u_return.dot(dir);
        const Proj_return = startReturn.clone().addScaledVector(dir, t_return);

        const Proj_supply_elev = Proj_supply.clone();
        Proj_supply_elev.y = P_supply.y;

        const Proj_return_elev = Proj_return.clone();
        Proj_return_elev.y = P_return.y;

        // Draw supply path
        this.drawPreviewPath(group, startSupply, [Proj_supply, Proj_supply_elev, P_supply], r, supplyColor, isInvalidAngle);

        // Draw return path
        this.drawPreviewPath(group, startReturn, [Proj_return, Proj_return_elev, P_return], r, returnColor, isInvalidAngle);
      } else {
        let endSupply = end.clone();
        let endReturn = end.clone();
        endSupply.addScaledVector(perp, halfSpacing);
        endReturn.addScaledVector(perp, -halfSpacing);

        const supplyMesh = this.createPipePreviewMesh(startSupply, endSupply, r, supplyColor, isInvalidAngle);
        group.add(supplyMesh);

        const returnMesh = this.createPipePreviewMesh(startReturn, endReturn, r, returnColor, isInvalidAngle);
        group.add(returnMesh);
      }
    }

    // Если есть автодок, нарисуем коннекторы-кольца вокруг портов в качестве индикатора
    if (this.dockedPorts) {
      const ringGeom = new THREE.RingGeometry(r * 1.5, r * 2.2, 16);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide });
      
      const ringS = new THREE.Mesh(ringGeom, ringMat);
      ringS.position.copy(this.dockedPorts.supply);
      ringS.rotation.x = Math.PI / 2;
      group.add(ringS);

      const ringR = new THREE.Mesh(ringGeom, ringMat);
      ringR.position.copy(this.dockedPorts.return);
      ringR.rotation.x = Math.PI / 2;
      group.add(ringR);
    }

    // Также нарисуем кольца для всех автоматически подцепляемых радиаторов
    if (isWallSnapped) {
      const dir = new THREE.Vector3().subVectors(end, start);
      const len = dir.length();
      const dirNorm = dir.clone().normalize();

      for (const elem of this.projectElements) {
        if (elem.type === "radiator") {
          const ports = this.getEquipmentPorts(elem);
          if (ports) {
            const u = ports.supply.clone().sub(start);
            u.y = 0;
            const t = u.dot(dirNorm);
            if (t > 0.05 && t < len - 0.05) {
              const proj = start.clone().addScaledVector(dirNorm, t);
              proj.y = ports.supply.y;
              if (ports.supply.distanceTo(proj) < 0.3) {
                const ringGeom = new THREE.RingGeometry(r * 1.5, r * 2.2, 16);
                const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide }); // зеленый для автоподключения!
                
                const ringS = new THREE.Mesh(ringGeom, ringMat);
                ringS.position.copy(ports.supply);
                ringS.rotation.x = Math.PI / 2;
                group.add(ringS);

                const ringR = new THREE.Mesh(ringGeom, ringMat);
                ringR.position.copy(ports.return);
                ringR.rotation.x = Math.PI / 2;
                group.add(ringR);
              }
            }
          }
        }
      }
    }

    this.previewMesh = group as any;
    this.world.scene.three.add(group);
  }

  private createPipePreviewMesh(
    start: THREE.Vector3,
    end: THREE.Vector3,
    r: number,
    colorHex: number,
    isInvalidAngle: boolean
  ): THREE.Mesh {
    const distance = start.distanceTo(end);
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(end, start).normalize();

    const geom = new THREE.CylinderGeometry(r, r, Math.max(distance, 0.001), 16);
    geom.rotateX(Math.PI / 2); // Поворачиваем цилиндр, чтобы шел по оси Z

    const material = new THREE.MeshStandardMaterial({
      color: isInvalidAngle ? 0xef4444 : colorHex,
      roughness: 0.3,
      metalness: 0.2,
      transparent: true,
      opacity: 0.7,
    });

    const mesh = new THREE.Mesh(geom, material);
    mesh.position.copy(center);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

    return mesh;
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
    this.wallSnapActive = false;
  }

  private savePipeSegments(
    start: THREE.Vector3,
    pathPoints: THREE.Vector3[],
    systemName: string,
    pairId: string,
    role: "supply" | "return"
  ) {
    let current = start;
    pathPoints.forEach((pt, index) => {
      if (current.distanceTo(pt) > 0.01) { // more than 10mm
        const id = `pipe-${role}-${Date.now()}-${Math.round(Math.random() * 10000)}-${index}`;
        const pipe: PipeElement = {
          id,
          type: "pipe",
          start: [current.x * 1000, current.y * 1000, current.z * 1000],
          end: [pt.x * 1000, pt.y * 1000, pt.z * 1000],
          size: { d: this.activeParams.d },
          material: this.activeParams.material,
          system: systemName,
          sortamentRef: this.activeParams.sortamentRef,
          pairId,
          role
        };
        this.projectElements.push(pipe);
        current = pt;
      }
    });
  }

  protected saveSegment(start: THREE.Vector3, end: THREE.Vector3) {
    // Прижимаем к грани стены (как в превью), чтобы коммит совпал с предпросмотром
    end = this.snapToWallFace(end);

    const pairId = `pair-${Date.now()}`;
    const floorY = start.y;

    // Check if we are close to a wall
    let isWallSnapped = false;
    if (this.activeType === "heating" && this._layoutMode === "wall") {
      for (const elem of this.projectElements) {
        if (elem.type === "wall" && elem.start && elem.end) {
          const wStart = new THREE.Vector3(elem.start[0] / 1000, end.y, elem.start[2] / 1000);
          const wEnd = new THREE.Vector3(elem.end[0] / 1000, end.y, elem.end[2] / 1000);
          const wallDir = new THREE.Vector3().subVectors(wEnd, wStart).normalize();
          const toPoint = new THREE.Vector3().subVectors(end, wStart);
          const len = wStart.distanceTo(wEnd);
          let t = toPoint.dot(wallDir);
          t = Math.max(0, Math.min(len, t));
          const proj = wStart.clone().addScaledVector(wallDir, t);
          if (end.distanceTo(proj) < 0.4) {
            isWallSnapped = true;
            break;
          }
        }
      }
    }
    this.wallSnapActive = isWallSnapped;

    if (isWallSnapped) {
      // Stacked vertically: supply on top (105mm), return on bottom (50mm)
      const ySupply = floorY + 0.105;
      const yReturn = floorY + 0.05;

      const startSupply = start.clone(); startSupply.y = ySupply;
      const endSupply = end.clone(); endSupply.y = ySupply;

      const startReturn = start.clone(); startReturn.y = yReturn;
      const endReturn = end.clone(); endReturn.y = yReturn;

      // Find crossed radiators
      const dir = new THREE.Vector3().subVectors(end, start);
      const len = dir.length();
      const dirNorm = dir.clone().normalize();

      const crossedRadiators: { elem: any; t: number; ports: any }[] = [];

      for (const elem of this.projectElements) {
        if (elem.type === "radiator") {
          const ports = this.getEquipmentPorts(elem);
          if (ports) {
            // Project ports.supply horizontally
            const u = ports.supply.clone().sub(start);
            u.y = 0;
            const t = u.dot(dirNorm);
            if (t > 0.05 && t < len - 0.05) {
              const proj = start.clone().addScaledVector(dirNorm, t);
              proj.y = ports.supply.y;
              if (ports.supply.distanceTo(proj) < 0.3) {
                crossedRadiators.push({ elem, t, ports });
              }
            }
          }
        }
      }

      // Sort by t ascending
      crossedRadiators.sort((a, b) => a.t - b.t);

      if (crossedRadiators.length > 0) {
        // Save supply path through crossed radiators
        let currentSupply = startSupply.clone();
        crossedRadiators.forEach((item) => {
          const Proj_supply = startSupply.clone().addScaledVector(dirNorm, item.t);
          const Proj_supply_elev = Proj_supply.clone();
          Proj_supply_elev.y = item.ports.supply.y;

          // Main horizontal pipe segment leading to this radiator's branch
          this.savePipeSegments(currentSupply, [Proj_supply], this.activeParams.systemSupply, pairId, "supply");

          // Perpendicular branch connections (vertical and horizontal)
          this.savePipeSegments(Proj_supply, [Proj_supply_elev, item.ports.supply], this.activeParams.systemSupply, pairId, "supply");

          currentSupply.copy(Proj_supply);
        });
        // Save final main segment to endSupply
        this.savePipeSegments(currentSupply, [endSupply], this.activeParams.systemSupply, pairId, "supply");

        // Save return path through crossed radiators
        let currentReturn = startReturn.clone();
        crossedRadiators.forEach((item) => {
          const Proj_return = startReturn.clone().addScaledVector(dirNorm, item.t);
          const Proj_return_elev = Proj_return.clone();
          Proj_return_elev.y = item.ports.return.y;

          // Main horizontal pipe segment leading to this radiator's branch
          this.savePipeSegments(currentReturn, [Proj_return], this.activeParams.systemReturn, pairId, "return");

          // Perpendicular branch connections (vertical and horizontal)
          this.savePipeSegments(Proj_return, [Proj_return_elev, item.ports.return], this.activeParams.systemReturn, pairId, "return");

          currentReturn.copy(Proj_return);
        });
        // Save final main segment to endReturn
        this.savePipeSegments(currentReturn, [endReturn], this.activeParams.systemReturn, pairId, "return");
      } else {
        // Just save a single straight segment for supply and return
        this.savePipeSegments(startSupply, [endSupply], this.activeParams.systemSupply, pairId, "supply");
        this.savePipeSegments(startReturn, [endReturn], this.activeParams.systemReturn, pairId, "return");
      }
    } else {
      // Normal horizontal parallel segment (e.g. cooling or heating away from walls)
      // Check for direct end docking
      this.checkAutoDock(end);

      const halfSpacing = this.activeParams.spacing / 2 / 1000;
      const dir = new THREE.Vector3().subVectors(end, start).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

      let startSupply = start.clone();
      let startReturn = start.clone();
      if (this.lastSegmentDir) {
        const prevPerp = new THREE.Vector3(-this.lastSegmentDir.z, 0, this.lastSegmentDir.x).normalize();
        startSupply.addScaledVector(prevPerp, halfSpacing);
        startReturn.addScaledVector(prevPerp, -halfSpacing);
      } else {
        startSupply.addScaledVector(perp, halfSpacing);
        startReturn.addScaledVector(perp, -halfSpacing);
      }

      if (this.dockedPorts) {
        const P_supply = this.dockedPorts.supply;
        const P_return = this.dockedPorts.return;

        const u_supply = P_supply.clone().sub(startSupply);
        u_supply.y = 0;
        const t_supply = u_supply.dot(dir);
        const Proj_supply = startSupply.clone().addScaledVector(dir, t_supply);

        const u_return = P_return.clone().sub(startReturn);
        u_return.y = 0;
        const t_return = u_return.dot(dir);
        const Proj_return = startReturn.clone().addScaledVector(dir, t_return);

        const Proj_supply_elev = Proj_supply.clone();
        Proj_supply_elev.y = P_supply.y;

        const Proj_return_elev = Proj_return.clone();
        Proj_return_elev.y = P_return.y;

        // Save supply segments
        this.savePipeSegments(startSupply, [Proj_supply, Proj_supply_elev, P_supply], this.activeParams.systemSupply, pairId, "supply");

        // Save return segments
        this.savePipeSegments(startReturn, [Proj_return, Proj_return_elev, P_return], this.activeParams.systemReturn, pairId, "return");
      } else {
        let endSupply = end.clone();
        let endReturn = end.clone();
        endSupply.addScaledVector(perp, halfSpacing);
        endReturn.addScaledVector(perp, -halfSpacing);

        this.savePipeSegments(startSupply, [endSupply], this.activeParams.systemSupply, pairId, "supply");
        this.savePipeSegments(startReturn, [endReturn], this.activeParams.systemReturn, pairId, "return");
      }
    }

    // Генерируем фасонные детали для новых участков
    const updatedElements = FittingGenerator.generateFittings(this.projectElements);
    this.projectElements.length = 0;
    this.projectElements.push(...updatedElements);

    // Отрисовываем обновленные элементы
    const ductTool = (window as any).ductDrawingTool;
    if (ductTool) {
      ductTool.renderAll(this.projectElements);
    }

    this.onElementsUpdated();
    console.log(`Parallel supply and return pipes saved. Pair ID: ${pairId}`);

    // Если произошло докование к прибору, сбросим текущее ведение трассы, завершая черчение
    if (this.dockedPorts) {
      this.deactivate();
      window.dispatchEvent(new CustomEvent("tool-deactivated"));
    }
  }

  protected inheritParameters(elem: any) {
    if (elem.type === "pipe") {
      this.activeParams.d = elem.size.d;
      this.activeParams.material = elem.material;
      this.activeParams.sortamentRef = elem.sortamentRef;
      this.activeParams.elevation = elem.start[1];

      window.dispatchEvent(new CustomEvent("tool-params-sync", { detail: {
        toolType: "twopipe",
        d: elem.size.d,
        material: elem.material,
        sortamentRef: elem.sortamentRef,
        elevation: elem.start[1]
      }}));
      console.log("TwoPipe drawing tool inherited parameters:", this.activeParams);
    }
  }
}
