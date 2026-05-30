import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { DuctDrawingTool, colorNameToHex } from "../DuctDrawingTool";
import { FittingGenerator } from "../FittingGenerator";
import { SmartSnap } from "../SmartSnap";


export interface TerminalElement {
  id: string;
  type: "terminal";
  kind: "grille" | "diffuser";
  model: string;
  host: string; // duct ID or empty string
  position: [number, number, number]; // в мм
}

// Режим работы инструмента
type ToolMode = "placing" | "connecting";

export class TerminalPlacementTool {
  components: OBC.Components;
  world: OBC.World;
  ductDrawingTool: DuctDrawingTool;

  enabled = false;
  activeKind: "grille" | "diffuser" = "grille";

  // Текущий режим: размещение или подключение к воздуховоду
  mode: ToolMode = "placing";

  // Последний размещённый терминал, ожидающий подключения
  pendingTerminal: TerminalElement | null = null;
  // Вспомогательный меш ответвляющегося воздуховода (превью подключения)
  private connectionPreviewMesh: THREE.Object3D | null = null;

  projectElements: any[] = [];
  onElementsUpdated: () => void = () => {};

  elevation = 0; // в мм (активная рабочая высота)

  // Вспомогательные 3D-объекты
  previewMesh: THREE.Mesh | null = null;

  private raycaster = new THREE.Raycaster();
  private hoveredDuct: any | null = null;
  private projectedPoint: THREE.Vector3 | null = null;

  // Подсветка воздуховодов в режиме подключения
  private highlightedDuctMeshes: THREE.Mesh[] = [];
  private originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

  private smartSnap = new SmartSnap();

  constructor(components: OBC.Components, world: OBC.World, ductDrawingTool: DuctDrawingTool) {
    this.components = components;
    this.world = world;
    this.ductDrawingTool = ductDrawingTool;
  }

  setElevation(elev: number) {
    this.elevation = elev;
  }

  activate(kind: "grille" | "diffuser" = "grille") {
    if (this.enabled && this.activeKind === kind && this.mode === "placing") return;

    if (this.enabled) this.deactivate();

    this.enabled = true;
    this.activeKind = kind;
    this.mode = "placing";
    this.pendingTerminal = null;

    const container = this.world.renderer?.three.domElement.parentElement;
    if (container) {
      container.addEventListener("mousemove", this.handleMouseMove);
      container.addEventListener("pointerdown", this.handleMouseDown);
    }
    window.addEventListener("keydown", this.handleKeyDown);

    this.createPreview();
    console.log(`Terminal placement tool activated for: ${kind}`);

    (window as any).projectBrowserActiveTab = "params";
    window.dispatchEvent(new CustomEvent("active-tool-changed"));
  }

  deactivate() {
    if (!this.enabled) return;
    this.enabled = false;
    this.mode = "placing";
    this.pendingTerminal = null;
    this.hoveredDuct = null;
    this.projectedPoint = null;

    this.removePreview();
    this.removeConnectionPreview();
    this.clearDuctHighlights();

    this.smartSnap.clearGuides(this.world.scene.three);

    const container = this.world.renderer?.three.domElement.parentElement;
    if (container) {
      container.removeEventListener("mousemove", this.handleMouseMove);
      container.removeEventListener("pointerdown", this.handleMouseDown);
    }
    window.removeEventListener("keydown", this.handleKeyDown);

    // Сбрасываем курсор
    const domEl = this.world.renderer?.three.domElement.parentElement;
    if (domEl) domEl.style.cursor = "";

    console.log("Terminal placement tool deactivated.");
  }

  activateConnectionMode(terminal: TerminalElement) {
    if (this.enabled) this.deactivate();

    this.enabled = true;
    this.mode = "connecting";
    this.pendingTerminal = terminal;
    this.hoveredDuct = null;
    this.projectedPoint = null;

    const container = this.world.renderer?.three.domElement.parentElement;
    if (container) {
      container.addEventListener("mousemove", this.handleMouseMove);
      container.addEventListener("pointerdown", this.handleMouseDown);
    }
    window.addEventListener("keydown", this.handleKeyDown);

    this.highlightDucts();

    if (container) container.style.cursor = "crosshair";

    console.log(`Connection mode activated manually for terminal: ${terminal.id}`);
  }

  setElements(elements: any[], updateCallback: () => void) {
    this.projectElements = elements;
    this.onElementsUpdated = updateCallback;
  }

  private createPreview() {
    this.removePreview();

    let geom: THREE.BufferGeometry;
    if (this.activeKind === "grille") {
      geom = new THREE.BoxGeometry(0.3, 0.02, 0.2);
    } else {
      geom = new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16);
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0x33ff33,
      transparent: true,
      opacity: 0.6,
      depthTest: false
    });

    this.previewMesh = new THREE.Mesh(geom, material);
    this.previewMesh.visible = false;
    this.world.scene.three.add(this.previewMesh);
  }

  private removePreview() {
    if (this.previewMesh) {
      if (this.previewMesh.geometry) this.previewMesh.geometry.dispose();
      if (Array.isArray(this.previewMesh.material)) {
        this.previewMesh.material.forEach(m => m.dispose());
      } else if (this.previewMesh.material) {
        this.previewMesh.material.dispose();
      }
      this.world.scene.three.remove(this.previewMesh);
      this.previewMesh = null;
    }
  }

  private removeConnectionPreview() {
    if (this.connectionPreviewMesh) {
      this.connectionPreviewMesh.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
          else child.material.dispose();
        }
      });
      this.world.scene.three.remove(this.connectionPreviewMesh);
      this.connectionPreviewMesh = null;
    }
  }

  // Подсветка всех воздуховодов при режиме подключения
  private highlightDucts() {
    this.clearDuctHighlights();
    const ductMeshes = this.ductDrawingTool.ductsGroup.children;
    ductMeshes.forEach(obj => {
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const elemId = mesh.userData.elementId;
        const elem = this.projectElements.find(e => e.id === elemId);
        if (elem && elem.type === "duct") {
          this.originalMaterials.set(mesh, mesh.material);
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0xfbbf24, // янтарный
            emissive: 0xfbbf24,
            emissiveIntensity: 0.25,
            transparent: true,
            opacity: 0.75,
          });
          this.highlightedDuctMeshes.push(mesh);
        }
      });
    });
  }

  private clearDuctHighlights() {
    this.highlightedDuctMeshes.forEach(mesh => {
      const orig = this.originalMaterials.get(mesh);
      if (orig) {
        if (Array.isArray(orig)) {
          orig.forEach(m => m.dispose());
        } else {
          (mesh.material as THREE.Material).dispose();
        }
        mesh.material = orig;
      }
    });
    this.highlightedDuctMeshes = [];
    this.originalMaterials.clear();
  }

  // Режим 1: размещение терминала
  private handleMouseMovePlacing = (event: MouseEvent) => {
    const dom = this.world.renderer?.three.domElement;
    if (!dom) return;

    const rect = dom.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.world.camera.three);

    // Привязка к горизонтальной плоскости на активной отметке
    const hPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.elevation / 1000));
    const targetPoint = new THREE.Vector3();

    if (this.raycaster.ray.intersectPlane(hPlane, targetPoint)) {
      // Сетка 100мм
      const step = 0.1;
      targetPoint.x = Math.round(targetPoint.x / step) * step;
      targetPoint.z = Math.round(targetPoint.z / step) * step;

      // Smart alignment snap
      const { snapped, guides } = this.smartSnap.snap(targetPoint, this.projectElements);
      targetPoint.x = snapped.x;
      targetPoint.z = snapped.z;
      this.smartSnap.renderGuides(guides, this.world.scene.three);

      this.projectedPoint = targetPoint.clone();

      if (this.previewMesh) {
        this.previewMesh.position.copy(targetPoint);
        this.previewMesh.visible = true;
      }
    } else {
      if (this.previewMesh) this.previewMesh.visible = false;
      this.projectedPoint = null;
    }
  };

  // Режим 2: выбор воздуховода для подключения
  private handleMouseMoveConnecting = (event: MouseEvent) => {
    const dom = this.world.renderer?.three.domElement;
    if (!dom || !this.pendingTerminal) return;

    const rect = dom.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.world.camera.three);

    // Ищем пересечение с мешами воздуховодов
    const allMeshes: THREE.Mesh[] = [];
    this.ductDrawingTool.ductsGroup.children.forEach(obj => {
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) allMeshes.push(mesh);
      });
    });

    const intersects = this.raycaster.intersectObjects(allMeshes);

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh;
      const elemId = mesh.userData.elementId;
      const duct = this.projectElements.find(e => e.id === elemId && e.type === "duct");

      if (duct) {
        this.hoveredDuct = duct;

        // Строим превью ответвляющегося воздуховода
        this.removeConnectionPreview();

        const termPos = new THREE.Vector3(
          this.pendingTerminal.position[0] / 1000,
          this.pendingTerminal.position[1] / 1000,
          this.pendingTerminal.position[2] / 1000
        );

        const pStart = new THREE.Vector3(duct.start[0] / 1000, duct.start[1] / 1000, duct.start[2] / 1000);
        const pEnd = new THREE.Vector3(duct.end[0] / 1000, duct.end[1] / 1000, duct.end[2] / 1000);
        const snapOnDuct = this.projectPointOnSegment(termPos, pStart, pEnd);

        // Точка подключения — на поверхности воздуховода
        const radius = (duct.size.d || 200) / 2 / 1000;
        const ductH = (duct.size.h || 200) / 1000;
        const offset = duct.shape === "round" ? radius : ductH / 2;
        const connectionPoint = snapOnDuct.clone();
        connectionPoint.y += offset;

        // Превью = цилиндр от терминала до точки подключения
        const dist = termPos.distanceTo(connectionPoint);
        if (dist > 0.01) {
          const center = new THREE.Vector3().addVectors(termPos, connectionPoint).multiplyScalar(0.5);
          const dir = new THREE.Vector3().subVectors(connectionPoint, termPos).normalize();

          // Размер ответвления совпадает с воздуховодом
          const branchRadius = (duct.shape === "round" ? (duct.size.d || 200) : Math.min(duct.size.w || 200, 200)) / 2 / 1000;
          const geom = new THREE.CylinderGeometry(branchRadius, branchRadius, dist, 16);

          // Цвет из системы воздуховода
          const sysColorName = (window as any).systemColorSettings?.[duct.system || "Приточный"] || "синий";
          const color = colorNameToHex[sysColorName] || 0x3b82f6;

          const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5 });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.copy(center);
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

          this.connectionPreviewMesh = mesh;
          this.world.scene.three.add(mesh);
        }
        return;
      }
    }

    // Воздуховод не найден
    this.hoveredDuct = null;
    this.removeConnectionPreview();
  };

  private handleMouseMove = (event: MouseEvent) => {
    if (!this.enabled) return;
    if (this.mode === "placing") {
      this.handleMouseMovePlacing(event);
    } else {
      this.handleMouseMoveConnecting(event);
    }
  };

  private handleMouseDown = (event: PointerEvent) => {
    if (!this.enabled) return;

    if (event.button === 2) {
      event.preventDefault();
      if (this.mode === "connecting") {
        // ПКМ в режиме подключения — отменяем подключение и выходим из инструмента
        this.pendingTerminal = null;
        this.removeConnectionPreview();
        this.clearDuctHighlights();
        this.deactivate();
        window.dispatchEvent(new CustomEvent("terminal-connect-cancelled"));
        window.dispatchEvent(new CustomEvent("tool-deactivated")); // обновляем UI
      } else {
        // ПКМ в режиме размещения — выходим из инструмента
        this.deactivate();
        window.dispatchEvent(new CustomEvent("tool-deactivated"));
      }
      return;
    }

    if (event.button !== 0) return;

    if (this.mode === "placing") {
      // === РАЗМЕЩЕНИЕ ТЕРМИНАЛА ===
      if (!this.projectedPoint) return;

      this.smartSnap.clearGuides(this.world.scene.three);

      const id = `term-${Date.now()}-${Math.round(Math.random() * 1000)}`;
      const pos = this.projectedPoint;

      const terminal: TerminalElement = {
        id,
        type: "terminal",
        kind: this.activeKind,
        model: this.activeKind === "grille" ? "Решетка АМН 300x200" : "Диффузор ДКВ 250",
        host: "",
        position: [pos.x * 1000, pos.y * 1000, pos.z * 1000]
      };

      this.projectElements.push(terminal);
      this.ductDrawingTool.renderAll(this.projectElements);
      this.onElementsUpdated();

      // Уведомляем UI
      window.dispatchEvent(new CustomEvent("elements-updated"));

      console.log(`Terminal placed freely at ${JSON.stringify(terminal.position)}`);

    } else {
      // === ПОДКЛЮЧЕНИЕ К ВОЗДУХОВОДУ ===
      if (!this.hoveredDuct || !this.pendingTerminal) return;

      const duct = this.hoveredDuct;
      const terminal = this.pendingTerminal;

      const termPos = new THREE.Vector3(
        terminal.position[0] / 1000,
        terminal.position[1] / 1000,
        terminal.position[2] / 1000
      );

      const pStart = new THREE.Vector3(duct.start[0] / 1000, duct.start[1] / 1000, duct.start[2] / 1000);
      const pEnd = new THREE.Vector3(duct.end[0] / 1000, duct.end[1] / 1000, duct.end[2] / 1000);
      const snapOnDuct = this.projectPointOnSegment(termPos, pStart, pEnd);

      // Точка подключения на поверхности воздуховода (снизу)
      const radius = (duct.size.d || 200) / 2 / 1000;
      const ductH = (duct.size.h || 200) / 1000;
      const offset = duct.shape === "round" ? radius : ductH / 2;
      const connectionPoint = snapOnDuct.clone();
      connectionPoint.y += offset;

      // Размер ответвляющегося воздуховода — наследуем от родительского
      const branchShape = duct.shape;
      const branchSize = { ...duct.size };
      // Уменьшаем сечение ответвления (примерно 50% от основного)
      if (branchShape === "round") {
        branchSize.d = Math.max(100, Math.round((branchSize.d || 200) * 0.6 / 50) * 50);
      } else {
        branchSize.w = Math.max(100, Math.round((branchSize.w || 200) * 0.6 / 50) * 50);
        branchSize.h = Math.max(100, Math.round((branchSize.h || 150) * 0.6 / 50) * 50);
      }

      // Создаём сегмент воздуховода-ответвления
      const branchId = `duct-${Date.now()}-${Math.round(Math.random() * 1000)}`;
      const branch = {
        id: branchId,
        type: "duct",
        shape: branchShape,
        size: branchSize,
        start: [termPos.x * 1000, termPos.y * 1000, termPos.z * 1000] as [number, number, number],
        end: [connectionPoint.x * 1000, connectionPoint.y * 1000, connectionPoint.z * 1000] as [number, number, number],
        sortamentRef: duct.sortamentRef || "VSN353-R-200",
        material: duct.material || "steel_galv",
        system: duct.system || "Приточный",
      };

      // Обновляем позицию терминала — на конце ответвления
      terminal.position = [termPos.x * 1000, termPos.y * 1000, termPos.z * 1000];
      terminal.host = branchId;

      // Вставляем ответвление в проект
      this.projectElements.push(branch);

      // Регенерируем фасонные детали и перерисовываем
      const updatedElements = FittingGenerator.generateFittings(this.projectElements);
      this.projectElements.length = 0;
      this.projectElements.push(...updatedElements);

      this.removeConnectionPreview();
      this.clearDuctHighlights();
      this.ductDrawingTool.renderAll(this.projectElements);
      this.onElementsUpdated();

      console.log(`Connected terminal ${terminal.id} to duct ${duct.id} via branch ${branchId}`);

      // Завершаем инструмент после успешного подключения
      this.deactivate();
      window.dispatchEvent(new CustomEvent("tool-deactivated")); // обновляем UI
    }
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!this.enabled) return;

    const activeEl = document.activeElement;
    if (
      activeEl && (
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "SELECT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.hasAttribute("contenteditable") ||
        activeEl.localName.includes("bim-text-input") ||
        activeEl.localName.includes("bim-number-input")
      )
    ) {
      return;
    }

    // Tab — переключение уровней
    if (event.key === "Tab") {
      event.preventDefault();
      const levels = (window as any).projectLevels || {};
      const levelsArray = Object.entries(levels).map(([name, val]) => ({ name, val: Number(val) }));

      if (levelsArray.length > 0) {
        levelsArray.sort((a, b) => a.val - b.val);
        const currentIndex = levelsArray.findIndex(l => l.val === this.elevation);
        const nextIndex = currentIndex !== -1 ? (currentIndex + 1) % levelsArray.length : 0;
        const nextLevel = levelsArray[nextIndex];
        window.dispatchEvent(new CustomEvent("elevation-updated", { detail: { elevation: nextLevel.val } }));
        console.log(`Tab: switched to ${nextLevel.name} (${nextLevel.val} mm)`);
      }
      return;
    }

    // Escape — выход из режима подключения без подключения
    if (event.key === "Escape") {
      if (this.mode === "connecting") {
        this.pendingTerminal = null;
        this.removeConnectionPreview();
        this.clearDuctHighlights();
        this.mode = "placing";
        const domEl = this.world.renderer?.three.domElement.parentElement;
        if (domEl) domEl.style.cursor = "";
        this.createPreview();
        window.dispatchEvent(new CustomEvent("tool-deactivated"));
      }
    }
  };

  private projectPointOnSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(p, a);

    let t = ap.dot(ab) / ab.dot(ab);
    t = Math.max(0, Math.min(1, t));

    return new THREE.Vector3().addVectors(a, ab.clone().multiplyScalar(t));
  }
}
