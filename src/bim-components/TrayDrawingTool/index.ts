import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { BaseLineTool } from "../BaseLineTool";
import { FittingGenerator } from "../FittingGenerator";

export interface TrayElement {
  id: string;
  type: "tray";
  start: [number, number, number]; // в мм
  end: [number, number, number];   // в мм
  width: number;                  // в мм
  height: number;                 // в мм
  kind: "solid" | "perforated" | "ladder";
  system: string;
  sortamentRef: string;
}

export class TrayDrawingTool extends BaseLineTool {
  // Параметры черчения лотков
  activeParams = {
    width: 200,            // в мм
    height: 80,            // в мм
    kind: "solid" as "solid" | "perforated" | "ladder",
    system: "Силовые",
    sortamentRef: "TRAY-200x80",
    elevation: 0,          // в мм
  };

  // Храним временную превью-группу (так как лоток — это группа из 3 мешей)
  previewGroup: THREE.Group | null = null;

  constructor(components: OBC.Components, world: OBC.World) {
    super(components, world);
    this.enableWallSnapping = true;
    this.wallFaceOffset = 100; // 100 мм от грани стены по умолчанию
  }

  protected updatePreview(start: THREE.Vector3, end: THREE.Vector3, isInvalidAngle: boolean) {
    this.removePreview();
    
    this.previewGroup = this.createTrayMesh(
      start,
      end,
      this.activeParams.width / 1000,
      this.activeParams.height / 1000,
      true, // isPreview
      isInvalidAngle
    );
    
    this.world.scene.three.add(this.previewGroup);
  }

  protected removePreview() {
    if (this.previewGroup) {
      this.previewGroup.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.world.scene.three.remove(this.previewGroup);
      this.previewGroup = null;
    }
  }

  protected saveSegment(start: THREE.Vector3, end: THREE.Vector3) {
    const id = `tray-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    
    const tray: TrayElement = {
      id,
      type: "tray",
      start: [start.x * 1000, start.y * 1000, start.z * 1000],
      end: [end.x * 1000, end.y * 1000, end.z * 1000],
      width: this.activeParams.width,
      height: this.activeParams.height,
      kind: this.activeParams.kind,
      system: this.activeParams.system,
      sortamentRef: this.activeParams.sortamentRef
    };
    
    this.projectElements.push(tray);
    
    // Вызываем генератор фасонных деталей лотков и перерисовываем
    const updatedElements = FittingGenerator.generateFittings(this.projectElements);
    this.projectElements.length = 0;
    this.projectElements.push(...updatedElements);
    
    const ductTool = (window as any).ductDrawingTool;
    if (ductTool) {
      ductTool.renderAll(this.projectElements);
    }
    
    this.onElementsUpdated();
    console.log("Tray segment saved.");
  }

  // --- Geometry Helper ---

  private createTrayMesh(
    start: THREE.Vector3,
    end: THREE.Vector3,
    w: number,
    h: number,
    isPreview = false,
    isInvalidAngle = false
  ): THREE.Group {
    const group = new THREE.Group();
    const distance = start.distanceTo(end);
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    dir.y = 0;
    
    // Толщина борта лотка - 2 мм (0.002 м)
    const t = 0.002;
    
    // Материал
    const material = new THREE.MeshStandardMaterial({
      color: isPreview ? (isInvalidAngle ? 0xef4444 : 0x00aaff) : 0xcbd5e1, // slate-200
      roughness: isPreview ? 0.3 : 0.25,
      metalness: isPreview ? 0.1 : 0.8,
      transparent: isPreview,
      opacity: isPreview ? 0.6 : 1.0,
    });
    
    // 1. Дно лотка
    const bottomGeom = new THREE.BoxGeometry(w, t, distance);
    const bottomMesh = new THREE.Mesh(bottomGeom, material);
    bottomMesh.position.set(0, t / 2, 0);
    group.add(bottomMesh);
    
    // 2. Левый борт
    const leftGeom = new THREE.BoxGeometry(t, h, distance);
    const leftMesh = new THREE.Mesh(leftGeom, material);
    leftMesh.position.set(-w / 2 + t / 2, h / 2, 0);
    group.add(leftMesh);
    
    // 3. Правый борт
    const rightGeom = new THREE.BoxGeometry(t, h, distance);
    const rightMesh = new THREE.Mesh(rightGeom, material);
    rightMesh.position.set(w / 2 - t / 2, h / 2, 0);
    group.add(rightMesh);
    
    // Позиционируем и вращаем группу
    group.position.copy(center);
    const defaultDir = new THREE.Vector3(0, 0, 1);
    group.quaternion.setFromUnitVectors(defaultDir, dir);
    
    return group;
  }

  protected inheritParameters(elem: any) {
    if (elem.type === "tray") {
      this.activeParams.width = elem.width;
      this.activeParams.height = elem.height;
      this.activeParams.kind = elem.kind;
      this.activeParams.sortamentRef = elem.sortamentRef;
      this.activeParams.system = elem.system;
      this.activeParams.elevation = elem.start[1];

      window.dispatchEvent(new CustomEvent("tool-params-sync", { detail: {
        toolType: "tray",
        width: elem.width,
        height: elem.height,
        kind: elem.kind,
        sortamentRef: elem.sortamentRef,
        system: elem.system,
        elevation: elem.start[1]
      }}));
      console.log("Tray params inherited:", this.activeParams);
    }
  }
}
