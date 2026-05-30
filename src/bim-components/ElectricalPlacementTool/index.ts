import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { SmartSnap } from "../SmartSnap";


export interface ElectricalElement {
  id: string;
  type: "socket" | "panel" | "light" | "door" | "window" | "ac" | "radiator" | "ac_ceiling" | "toilet" | "sink" | "workstation";
  kind: "socket" | "panel" | "light" | "door" | "window" | "ac" | "radiator" | "ac_ceiling" | "toilet" | "sink" | "workstation";
  model: string;
  position: [number, number, number]; // в мм
  normal?: [number, number, number];
  rotation?: number; // в градусах для горизонтальных приборов
  width?: number;
  height?: number;
  hostWallId?: string;
}

export class ElectricalPlacementTool {
  components: OBC.Components;
  world: OBC.World;

  enabled = false;
  activeKind: "socket" | "panel" | "light" | "door" | "window" | "ac" | "radiator" | "ac_ceiling" | "toilet" | "sink" | "workstation" = "socket";

  projectElements: any[] = [];
  onElementsUpdated: () => void = () => {};

  elevation = 0; // в мм (активная рабочая высота)

  // Вспомогательные 3D-объекты
  previewMesh: THREE.Mesh | null = null;
  private mousePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private raycaster = new THREE.Raycaster();
  private hoveredWall: any | null = null;
  private lastSnappedPoint: THREE.Vector3 | null = null;
  private lastNormal: THREE.Vector3 | null = null;

  rotationAngle = 0; // в радианах, для горизонтальных элементов (Space для вращения)

  private smartSnap = new SmartSnap();

  constructor(components: OBC.Components, world: OBC.World, _ductDrawingTool?: unknown) {
    this.components = components;
    this.world = world;
  }

  setElevation(elev: number) {
    this.elevation = elev;
    this.mousePlane.constant = -(elev / 1000);
  }

  activate(kind: "socket" | "panel" | "light" | "door" | "window" | "ac" | "radiator" | "ac_ceiling" | "toilet" | "sink" | "workstation" = "socket") {
    if (this.enabled && this.activeKind === kind) return;

    if (this.enabled) this.deactivate();

    this.enabled = true;
    this.activeKind = kind;
    this.rotationAngle = 0;

    const container = this.world.renderer?.three.domElement.parentElement;
    if (container) {
      container.addEventListener("mousemove", this.handleMouseMove);
      container.addEventListener("pointerdown", this.handleMouseDown);
      window.addEventListener("keydown", this.handleKeyDown);
    }

    this.createPreview();
    console.log(`Placement tool activated for: ${kind}`);
  }

  deactivate() {
    if (!this.enabled) return;
    this.enabled = false;
    this.hoveredWall = null;
    this.lastSnappedPoint = null;
    this.lastNormal = null;

    this.removePreview();

    const container = this.world.renderer?.three.domElement.parentElement;
    if (container) {
      container.removeEventListener("mousemove", this.handleMouseMove);
      container.removeEventListener("pointerdown", this.handleMouseDown);
      window.removeEventListener("keydown", this.handleKeyDown);
    }

    this.smartSnap.clearGuides(this.world.scene.three);

    console.log("Placement tool deactivated.");
  }

  setElements(elements: any[], updateCallback: () => void) {
    this.projectElements = elements;
    this.onElementsUpdated = updateCallback;
  }

  private createPreview() {
    this.removePreview();

    let geom: THREE.BufferGeometry;
    let color = 0xffffff;

    if (this.activeKind === "socket") {
      geom = new THREE.BoxGeometry(0.06, 0.08, 0.08); // Г x В x Ш
      color = 0xffaa44; // оранжевый
    } else if (this.activeKind === "panel") {
      geom = new THREE.BoxGeometry(0.2, 0.6, 0.4); // Г x В x Ш
      color = 0x6b7280;
    } else if (this.activeKind === "light") {
      geom = new THREE.BoxGeometry(0.6, 0.05, 0.6);
      color = 0xfef08a;
    } else if (this.activeKind === "door") {
      geom = new THREE.BoxGeometry(0.12, 2.1, 0.9); // Г x В x Ш
      color = 0x8b5a2b; // дерево
    } else if (this.activeKind === "window") {
      geom = new THREE.BoxGeometry(0.12, 1.5, 1.2); // Г x В x Ш
      color = 0x38bdf8; // стекло
    } else if (this.activeKind === "radiator") {
      geom = new THREE.BoxGeometry(0.1, 0.6, 0.8); // Г x В x Ш
      color = 0xffffff; // белый
    } else if (this.activeKind === "ac_ceiling") {
      geom = new THREE.BoxGeometry(0.8, 0.3, 0.8); // Г x В x Ш (800x800x300мм объемный кассетник)
      color = 0xf1f5f9; // белый
    } else if (this.activeKind === "toilet") {
      geom = new THREE.BoxGeometry(0.45, 0.8, 0.7);
      color = 0xffffff;
    } else if (this.activeKind === "sink") {
      geom = new THREE.BoxGeometry(0.6, 0.2, 0.5);
      color = 0xffffff;
    } else if (this.activeKind === "workstation") {
      geom = new THREE.BoxGeometry(1.6, 0.75, 0.8); // Рабочее место: Ш x В x Г
      color = 0x6366f1; // индиго
    } else { // ac
      geom = new THREE.BoxGeometry(0.22, 0.28, 0.85);
      color = 0xf1f5f9;
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
    });

    this.previewMesh = new THREE.Mesh(geom, material);
    this.previewMesh.visible = false;
    this.world.scene.three.add(this.previewMesh);
  }

  private removePreview() {
    if (this.previewMesh) {
      if (this.previewMesh.geometry) this.previewMesh.geometry.dispose();
      if (Array.isArray(this.previewMesh.material)) {
        this.previewMesh.material.forEach((m: any) => m.dispose());
      } else if (this.previewMesh.material) {
        this.previewMesh.material.dispose();
      }
      this.world.scene.three.remove(this.previewMesh);
      this.previewMesh = null;
    }
  }

  private handleMouseMove = (event: MouseEvent) => {
    if (!this.enabled || !this.previewMesh) return;

    const dom = this.world.renderer?.three.domElement;
    if (!dom) return;

    const rect = dom.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.world.camera.three);

    const isWallMounted = ["socket", "door", "window", "ac", "radiator", "toilet", "sink"].includes(this.activeKind);
    
    // Получаем ductDrawingTool для доступа к ductsGroup
    const ductTool = (window as any).ductDrawingTool;

    if (isWallMounted) {
      // Собираем все меши стен из ductsGroup (они живут внутри группы, а не напрямую в scene)
      const wallElemIds = new Set(
        this.projectElements.filter((e) => e.type === "wall").map((e) => e.id)
      );
      const wallMeshes: THREE.Mesh[] = [];
      if (ductTool?.ductsGroup) {
        ductTool.ductsGroup.traverse((child: THREE.Object3D) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh && wallElemIds.has(mesh.userData?.elementId)) {
            wallMeshes.push(mesh);
          }
        });
      }

      const intersects = this.raycaster.intersectObjects(wallMeshes, false);
      if (intersects.length > 0) {
        const intersect = intersects[0];
        const mesh = intersect.object as THREE.Mesh;
        
        if (mesh && mesh.userData.elementId) {
          const wall = this.projectElements.find((e) => e.id === mesh.userData.elementId);
          if (!wall || wall.type !== "wall") return;
          this.hoveredWall = wall;

          const localNormal = intersect.face!.normal;
          const worldNormal = localNormal.clone().applyQuaternion(mesh.quaternion).normalize();
          this.lastNormal = worldNormal;

          // Инициализация пресетов высот настенных элементов
          if (!(window as any).wallHeightPresets) {
            (window as any).wallHeightPresets = {
              socket: 300,
              window: 700,
              radiator: 100,
              door: 0,
              ac: 2200,
              toilet: 0,
              sink: 850
            };
          }
          const presets = (window as any).wallHeightPresets;

          let targetY = intersect.point.y;
          if (this.activeKind === "socket") {
            targetY = presets.socket / 1000;
          } else if (this.activeKind === "door") {
            targetY = presets.door / 1000;
          } else if (this.activeKind === "window") {
            targetY = (presets.window + 1500 / 2) / 1000;
          } else if (this.activeKind === "ac") {
            targetY = presets.ac / 1000;
          } else if (this.activeKind === "radiator") {
            targetY = (presets.radiator + 600 / 2) / 1000;
          } else if (this.activeKind === "toilet") {
            targetY = presets.toilet / 1000;
          } else if (this.activeKind === "sink") {
            targetY = presets.sink / 1000;
          }

          const snapped = new THREE.Vector3(intersect.point.x, targetY, intersect.point.z);
          this.lastSnappedPoint = snapped;

          this.previewMesh.position.copy(snapped);
          this.previewMesh.position.addScaledVector(this.lastNormal, 0.01);

          if (this.activeKind === "socket") {
            this.previewMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.lastNormal);
          } else {
            this.previewMesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.lastNormal);
          }
          this.previewMesh.visible = true;
          return;
        }
      }

      this.previewMesh.visible = false;
      this.hoveredWall = null;
      this.lastSnappedPoint = null;
      this.lastNormal = null;
    } else {
      // Размещение щита или светильника на высоте elevation по горизонтальной сетке
      const target = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.mousePlane, target)) {
        const gridStep = 0.1;
        let snapped = new THREE.Vector3(
          Math.round(target.x / gridStep) * gridStep,
          this.elevation / 1000,
          Math.round(target.z / gridStep) * gridStep
        );

        // Smart alignment snap
        const { snapped: smartSnapped, guides } = this.smartSnap.snap(snapped, this.projectElements);
        snapped = smartSnapped;
        this.smartSnap.renderGuides(guides, this.world.scene.three);

        this.lastSnappedPoint = snapped;
        this.previewMesh.position.copy(snapped);

        if (this.activeKind === "panel") {
          this.previewMesh.position.y += 0.3;
        }

        this.previewMesh.rotation.y = this.rotationAngle;
        this.previewMesh.visible = true;
      }
    }
  };

  private handleMouseDown = (event: PointerEvent) => {
    if (!this.enabled) return;

    if (event.button === 2) {
      event.preventDefault();
      this.deactivate();
      window.dispatchEvent(new CustomEvent("tool-deactivated"));
      return;
    }

    if (event.button !== 0 || !this.lastSnappedPoint) return;

    this.smartSnap.clearGuides(this.world.scene.three);

    const id = `${this.activeKind}-${Date.now()}-${Math.round(Math.random() * 1000)}`;

    let newElem: ElectricalElement;

    if (this.activeKind === "socket") {
      if (!this.hoveredWall || !this.lastNormal) return;
      newElem = {
        id,
        type: "socket",
        kind: "socket",
        model: "Розетка электрическая 220В",
        position: [this.lastSnappedPoint.x * 1000, this.lastSnappedPoint.y * 1000, this.lastSnappedPoint.z * 1000],
        normal: [this.lastNormal.x, this.lastNormal.y, this.lastNormal.z],
      };
    } else if (this.activeKind === "door") {
      if (!this.hoveredWall || !this.lastNormal) return;
      newElem = {
        id,
        type: "door",
        kind: "door",
        model: "Дверь межкомнатная 900x2100",
        position: [this.lastSnappedPoint.x * 1000, this.lastSnappedPoint.y * 1000, this.lastSnappedPoint.z * 1000],
        normal: [this.lastNormal.x, this.lastNormal.y, this.lastNormal.z],
        width: 900,
        height: 2100,
        hostWallId: this.hoveredWall.id,
      };
    } else if (this.activeKind === "window") {
      if (!this.hoveredWall || !this.lastNormal) return;
      newElem = {
        id,
        type: "window",
        kind: "window",
        model: "Окно двухстворчатое 1200x1500",
        position: [this.lastSnappedPoint.x * 1000, this.lastSnappedPoint.y * 1000, this.lastSnappedPoint.z * 1000],
        normal: [this.lastNormal.x, this.lastNormal.y, this.lastNormal.z],
        width: 1200,
        height: 1500,
        hostWallId: this.hoveredWall.id,
      };
    } else if (this.activeKind === "ac") {
      if (!this.hoveredWall || !this.lastNormal) return;
      newElem = {
        id,
        type: "ac",
        kind: "ac",
        model: "Кондиционер сплит-система",
        position: [this.lastSnappedPoint.x * 1000, this.lastSnappedPoint.y * 1000, this.lastSnappedPoint.z * 1000],
        normal: [this.lastNormal.x, this.lastNormal.y, this.lastNormal.z],
        hostWallId: this.hoveredWall.id,
      };
    } else if (this.activeKind === "ac_ceiling") {
      newElem = {
        id,
        type: "ac_ceiling",
        kind: "ac_ceiling",
        model: "Кондиционер потолочный кассетный",
        position: [this.lastSnappedPoint.x * 1000, this.lastSnappedPoint.y * 1000, this.lastSnappedPoint.z * 1000],
        rotation: Math.round(this.rotationAngle * (180 / Math.PI)),
      };
    } else if (this.activeKind === "radiator") {
      if (!this.hoveredWall || !this.lastNormal) return;
      newElem = {
        id,
        type: "radiator",
        kind: "radiator",
        model: "Радиатор отопления секционный",
        position: [this.lastSnappedPoint.x * 1000, this.lastSnappedPoint.y * 1000, this.lastSnappedPoint.z * 1000],
        normal: [this.lastNormal.x, this.lastNormal.y, this.lastNormal.z],
        hostWallId: this.hoveredWall.id,
      };
    } else if (this.activeKind === "panel") {
      newElem = {
        id,
        type: "panel",
        kind: "panel",
        model: "Щит распределительный ЩР",
        position: [this.lastSnappedPoint.x * 1000, this.lastSnappedPoint.y * 1000 + 300, this.lastSnappedPoint.z * 1000],
        rotation: Math.round(this.rotationAngle * (180 / Math.PI)),
      };
    } else if (this.activeKind === "toilet") {
      if (!this.hoveredWall || !this.lastNormal) return;
      newElem = {
        id,
        type: "toilet",
        kind: "toilet",
        model: "Унитаз напольный с бачком",
        position: [this.lastSnappedPoint.x * 1000, this.lastSnappedPoint.y * 1000, this.lastSnappedPoint.z * 1000],
        normal: [this.lastNormal.x, this.lastNormal.y, this.lastNormal.z],
        hostWallId: this.hoveredWall.id,
      };
    } else if (this.activeKind === "sink") {
      if (!this.hoveredWall || !this.lastNormal) return;
      newElem = {
        id,
        type: "sink",
        kind: "sink",
        model: "Раковина подвесная фаянсовая",
        position: [this.lastSnappedPoint.x * 1000, this.lastSnappedPoint.y * 1000, this.lastSnappedPoint.z * 1000],
        normal: [this.lastNormal.x, this.lastNormal.y, this.lastNormal.z],
        hostWallId: this.hoveredWall.id,
      };
    } else if (this.activeKind === "workstation") {
      newElem = {
        id,
        type: "workstation",
        kind: "workstation",
        model: "Рабочее место (стол+стул+ПК)",
        position: [this.lastSnappedPoint.x * 1000, this.lastSnappedPoint.y * 1000, this.lastSnappedPoint.z * 1000],
        rotation: Math.round(this.rotationAngle * (180 / Math.PI)),
      };
    } else { // light
      newElem = {
        id,
        type: "light",
        kind: "light",
        model: "Светильник светодиодный 600x600",
        position: [this.lastSnappedPoint.x * 1000, this.lastSnappedPoint.y * 1000, this.lastSnappedPoint.z * 1000],
        rotation: Math.round(this.rotationAngle * (180 / Math.PI)),
      };
    }

    this.projectElements.push(newElem);
    this.onElementsUpdated();

    const ductTool = (window as any).ductDrawingTool;
    if (ductTool) {
      ductTool.renderAll(this.projectElements);
    }
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!this.enabled || !this.previewMesh) return;

    // Игнорируем ввод, если фокус находится в текстовом поле
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "SELECT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.hasAttribute("contenteditable") ||
        activeEl.localName.includes("bim-text-input") ||
        activeEl.localName.includes("bim-number-input"))
    ) {
      return;
    }

    // Переключение уровней через Tab
    if (event.key === "Tab") {
      event.preventDefault();
      const levels = (window as any).projectLevels || {};
      const levelsArray = Object.entries(levels).map(([name, val]) => ({ name, val: Number(val) }));
      
      if (levelsArray.length > 0) {
        levelsArray.sort((a, b) => a.val - b.val);
        const currentElev = this.elevation;
        let nextIndex = 0;
        
        const currentIndex = levelsArray.findIndex(l => l.val === currentElev);
        if (currentIndex !== -1) {
          nextIndex = (currentIndex + 1) % levelsArray.length;
        }
        
        const nextLevel = levelsArray[nextIndex];
        window.dispatchEvent(new CustomEvent("elevation-updated", { detail: { elevation: nextLevel.val } }));
        console.log(`Tab height shift in PlacementTool: switched to ${nextLevel.name} (${nextLevel.val} mm)`);
      }
      return;
    }

    if (event.code === "Space" && !["socket", "door", "window", "ac", "radiator", "toilet", "sink"].includes(this.activeKind)) {
      event.preventDefault();
      this.rotationAngle += Math.PI / 4;
      if (this.rotationAngle >= Math.PI * 2) this.rotationAngle -= Math.PI * 2;
      this.previewMesh.rotation.y = this.rotationAngle;
    }
  };
}
