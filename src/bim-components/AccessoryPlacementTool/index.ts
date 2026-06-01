import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { DuctDrawingTool } from "../DuctDrawingTool";

export interface AccessoryElement {
  id: string;
  type: "duct_accessory" | "pipe_accessory";
  kind: "throttle" | "silencer" | "fire_damper" | "ball_valve" | "balancing" | "filter";
  host: string; // ID родительского воздуховода или трубы
  position: [number, number, number]; // в мм, спроецировано на ось хоста
  size: any; // Копирует габариты хоста ({w, h} или {d})
  length: number; // длина корпуса в мм
}

export class AccessoryPlacementTool {
  components: OBC.Components;
  world: OBC.World;
  ductDrawingTool: DuctDrawingTool;

  enabled = false;
  activeKind: AccessoryElement["kind"] = "throttle";

  projectElements: any[] = [];
  onElementsUpdated: () => void = () => {};

  elevation = 0; // в мм

  previewMesh: THREE.Object3D | null = null;

  private raycaster = new THREE.Raycaster();
  private hoveredHost: any | null = null;
  private projectedPoint: THREE.Vector3 | null = null;

  constructor(components: OBC.Components, world: OBC.World, ductDrawingTool: DuctDrawingTool) {
    this.components = components;
    this.world = world;
    this.ductDrawingTool = ductDrawingTool;
  }

  setElevation(elev: number) {
    this.elevation = elev;
  }

  activate(kind: AccessoryElement["kind"]) {
    if (this.enabled && this.activeKind === kind) return;

    if (this.enabled) this.deactivate();

    this.enabled = true;
    this.activeKind = kind;
    this.hoveredHost = null;
    this.projectedPoint = null;

    const container = this.world.renderer?.three.domElement.parentElement;
    if (container) {
      container.addEventListener("mousemove", this.handleMouseMove);
      container.addEventListener("pointerdown", this.handleMouseDown);
    }
    window.addEventListener("keydown", this.handleKeyDown);

    this.createPreviewMesh();
    console.log(`Accessory placement tool activated for: ${kind}`);

    (window as any).projectBrowserActiveTab = "params";
    window.dispatchEvent(new CustomEvent("active-tool-changed"));
  }

  deactivate() {
    if (!this.enabled) return;
    this.enabled = false;
    this.hoveredHost = null;
    this.projectedPoint = null;

    this.removePreviewMesh();

    const container = this.world.renderer?.three.domElement.parentElement;
    if (container) {
      container.removeEventListener("mousemove", this.handleMouseMove);
      container.removeEventListener("pointerdown", this.handleMouseDown);
    }
    window.removeEventListener("keydown", this.handleKeyDown);

    const domEl = this.world.renderer?.three.domElement.parentElement;
    if (domEl) domEl.style.cursor = "";

    console.log("Accessory placement tool deactivated.");
  }

  setElements(elements: any[], updateCallback: () => void) {
    this.projectElements = elements;
    this.onElementsUpdated = updateCallback;
  }

  private getAccessoryLength(kind: AccessoryElement["kind"]): number {
    switch (kind) {
      case "silencer": return 600;
      case "fire_damper": return 300;
      case "throttle": return 100;
      case "ball_valve": return 120;
      case "balancing": return 160;
      case "filter": return 200;
      default: return 150;
    }
  }

  private createPreviewMesh() {
    this.removePreviewMesh();

    const len = this.getAccessoryLength(this.activeKind) / 1000; // в метры

    let geom: THREE.BufferGeometry;
    let matColor = 0x10b981; // emerald зеленый для превью размещения

    if (this.activeKind === "silencer") {
      geom = new THREE.BoxGeometry(0.35, 0.25, len);
    } else if (this.activeKind === "fire_damper") {
      geom = new THREE.BoxGeometry(0.28, 0.28, len);
      matColor = 0xef4444; // красный
    } else if (this.activeKind === "throttle") {
      geom = new THREE.CylinderGeometry(0.12, 0.12, len, 16);
    } else if (this.activeKind === "ball_valve") {
      geom = new THREE.SphereGeometry(0.06, 16, 16);
    } else if (this.activeKind === "balancing") {
      geom = new THREE.CylinderGeometry(0.05, 0.05, len, 12);
    } else {
      // filter
      geom = new THREE.CylinderGeometry(0.045, 0.045, len, 12);
    }

    // Если превью цилиндрическое по умолчанию, повернем его геометрию, чтобы ось шла по Z
    if (this.activeKind === "throttle" || this.activeKind === "balancing" || this.activeKind === "filter") {
      geom.rotateX(Math.PI / 2);
    }

    const material = new THREE.MeshStandardMaterial({
      color: matColor,
      transparent: true,
      opacity: 0.6,
      depthTest: false
    });

    const mesh = new THREE.Mesh(geom, material);

    // Добавим декоративную ручку/элемент для наглядности превью
    if (this.activeKind === "throttle") {
      const handleGeom = new THREE.BoxGeometry(0.02, 0.15, 0.02);
      const handle = new THREE.Mesh(handleGeom, material);
      handle.position.set(0, 0.12, 0);
      mesh.add(handle);
    } else if (this.activeKind === "ball_valve") {
      const handleGeom = new THREE.BoxGeometry(0.015, 0.03, 0.12);
      const handle = new THREE.Mesh(handleGeom, material);
      handle.position.set(0, 0.06, 0.03);
      mesh.add(handle);
    } else if (this.activeKind === "balancing") {
      const wheelGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.015, 12);
      wheelGeom.rotateX(Math.PI / 2);
      const wheel = new THREE.Mesh(wheelGeom, material);
      wheel.position.set(0, 0.07, 0);
      mesh.add(wheel);
    } else if (this.activeKind === "filter") {
      const chamberGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12);
      chamberGeom.rotateX(Math.PI / 3);
      const chamber = new THREE.Mesh(chamberGeom, material);
      chamber.position.set(0, -0.04, -0.02);
      mesh.add(chamber);
    }

    this.previewMesh = mesh;
    this.previewMesh.visible = false;
    this.world.scene.three.add(this.previewMesh);
  }

  private removePreviewMesh() {
    if (this.previewMesh) {
      this.previewMesh.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
          else child.material.dispose();
        }
      });
      this.world.scene.three.remove(this.previewMesh);
      this.previewMesh = null;
    }
  }

  private handleMouseMove = (event: MouseEvent) => {
    if (!this.enabled) return;

    const dom = this.world.renderer?.three.domElement;
    if (!dom) return;

    const rect = dom.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.world.camera.three);

    const expectedType = ["throttle", "silencer", "fire_damper"].includes(this.activeKind) ? "duct" : "pipe";

    // Собираем все меши прямых участков ожидаемого типа
    const allMeshes: THREE.Mesh[] = [];
    this.ductDrawingTool.ductsGroup.children.forEach(obj => {
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          const elemId = mesh.userData?.elementId;
          if (elemId) {
            const elem = this.projectElements.find(e => e.id === elemId);
            if (elem && elem.type === expectedType) {
              allMeshes.push(mesh);
            }
          }
        }
      });
    });

    const intersects = this.raycaster.intersectObjects(allMeshes);

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh;
      const elemId = mesh.userData.elementId;
      const hostElement = this.projectElements.find(e => e.id === elemId);

      if (hostElement) {
        this.hoveredHost = hostElement;

        const pA = new THREE.Vector3(hostElement.start[0] / 1000, hostElement.start[1] / 1000, hostElement.start[2] / 1000);
        const pB = new THREE.Vector3(hostElement.end[0] / 1000, hostElement.end[1] / 1000, hostElement.end[2] / 1000);

        const snapOnHost = this.projectPointOnSegment(intersects[0].point, pA, pB);
        this.projectedPoint = snapOnHost.clone();

        if (this.previewMesh) {
          this.previewMesh.position.copy(snapOnHost);
          
          const dir = new THREE.Vector3().subVectors(pB, pA).normalize();
          this.previewMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
          this.previewMesh.visible = true;
        }
        
        dom.style.cursor = "pointer";
        return;
      }
    }

    this.hoveredHost = null;
    this.projectedPoint = null;
    if (this.previewMesh) this.previewMesh.visible = false;
    dom.style.cursor = "default";
  };

  private handleMouseDown = (event: PointerEvent) => {
    if (!this.enabled) return;

    if (event.button === 2) {
      event.preventDefault();
      this.deactivate();
      window.dispatchEvent(new CustomEvent("tool-deactivated"));
      return;
    }

    if (event.button !== 0) return;

    if (this.hoveredHost && this.projectedPoint) {
      const host = this.hoveredHost;
      const pos = this.projectedPoint;

      const isDuctAcc = ["throttle", "silencer", "fire_damper"].includes(this.activeKind);
      const accType = isDuctAcc ? "duct_accessory" : "pipe_accessory";

      const id = `${isDuctAcc ? "duct" : "pipe"}-acc-${Date.now()}-${Math.round(Math.random() * 1000)}`;

      const accessory: AccessoryElement = {
        id,
        type: accType,
        kind: this.activeKind,
        host: host.id,
        position: [pos.x * 1000, pos.y * 1000, pos.z * 1000],
        size: { ...host.size },
        length: this.getAccessoryLength(this.activeKind)
      };

      this.projectElements.push(accessory);
      this.ductDrawingTool.renderAll(this.projectElements);
      this.onElementsUpdated();

      window.dispatchEvent(new CustomEvent("elements-updated"));
      console.log(`Placed accessory ${id} on host ${host.id}`);
    }
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Escape") {
      this.deactivate();
      window.dispatchEvent(new CustomEvent("tool-deactivated"));
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
