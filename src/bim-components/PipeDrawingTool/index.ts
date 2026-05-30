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
}

export class PipeDrawingTool extends BaseLineTool {
  // Параметры черчения трубопроводов
  activeParams = {
    d: 25,                 // диаметр в мм
    material: "steel_water" as "steel_water" | "ppr",
    system: "ХВС",
    sortamentRef: "PIPE-25",
    elevation: 0,          // в мм
  };

  constructor(components: OBC.Components, world: OBC.World) {
    super(components, world);
  }

  protected updatePreview(start: THREE.Vector3, end: THREE.Vector3, isInvalidAngle: boolean) {
    this.removePreview();
    
    this.previewMesh = this.createPipeMesh(
      start,
      end,
      this.activeParams.d / 2000, // радиус в метрах
      this.activeParams.material,
      true, // isPreview
      isInvalidAngle
    );
    
    this.world.scene.three.add(this.previewMesh);
  }

  protected removePreview() {
    if (this.previewMesh) {
      if (this.previewMesh.geometry) this.previewMesh.geometry.dispose();
      if (this.previewMesh.material) {
        if (Array.isArray(this.previewMesh.material)) {
          this.previewMesh.material.forEach((m: any) => m.dispose());
        } else {
          this.previewMesh.material.dispose();
        }
      }
      this.world.scene.three.remove(this.previewMesh);
      this.previewMesh = null;
    }
  }

  protected saveSegment(start: THREE.Vector3, end: THREE.Vector3) {
    const id = `pipe-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    
    const pipe: PipeElement = {
      id,
      type: "pipe",
      start: [start.x * 1000, start.y * 1000, start.z * 1000],
      end: [end.x * 1000, end.y * 1000, end.z * 1000],
      size: { d: this.activeParams.d },
      material: this.activeParams.material,
      system: this.activeParams.system,
      sortamentRef: this.activeParams.sortamentRef
    };
    
    this.projectElements.push(pipe);
    
    // Вызываем генератор фасонных деталей труб и перерисовываем
    const updatedElements = FittingGenerator.generateFittings(this.projectElements);
    this.projectElements.length = 0;
    this.projectElements.push(...updatedElements);
    
    const ductTool = (window as any).ductDrawingTool;
    if (ductTool) {
      ductTool.renderAll(this.projectElements);
    }
    
    this.onElementsUpdated();
    console.log("Pipe segment saved.");
  }

  // --- Geometry Helper ---

  private createPipeMesh(
    start: THREE.Vector3,
    end: THREE.Vector3,
    r: number,
    materialType: "steel_water" | "ppr",
    isPreview = false,
    isInvalidAngle = false
  ): THREE.Mesh {
    const distance = start.distanceTo(end);
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    
    const geom = new THREE.CylinderGeometry(r, r, distance, 16);
    
    // По умолчанию цилиндр выровнен по оси Y
    const defaultDir = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultDir, dir);
    
    // Цвета в зависимости от системы (с фолбеком на материал)
    let color = 0x7e8a96;
    let roughness = 0.25;
    let metalness = 0.8;
    
    const sysColorName = (window as any).systemColorSettings?.[this.activeParams.system || "ХВС"];
    if (sysColorName && (window as any).ductDrawingTool) {
      const colorMap = (window as any).ductDrawingTool.colorNameToHex || {
        "красный": 0xef4444,
        "синий": 0x3b82f6,
        "зеленый": 0x10b981,
        "коричневый": 0x7c2d12,
        "черный": 0x18181b
      };
      if (colorMap[sysColorName]) {
        color = colorMap[sysColorName];
      }
    } else {
      if (materialType === "steel_water") {
        color = 0x475569; // сталь ВГП (темно-серый)
      } else if (materialType === "ppr") {
        color = 0xe2e8f0; // полипропилен (белый пластик)
        roughness = 0.6;
        metalness = 0.1;
      }
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: isPreview ? (isInvalidAngle ? 0xef4444 : 0x00aaff) : color,
      roughness: isPreview ? 0.3 : roughness,
      metalness: isPreview ? 0.1 : metalness,
      transparent: isPreview,
      opacity: isPreview ? 0.6 : 1.0,
    });
    
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.copy(center);
    mesh.quaternion.copy(quaternion);
    
    return mesh;
  }

  protected inheritParameters(elem: any) {
    if (elem.type === "pipe") {
      this.activeParams.d = elem.size.d;
      this.activeParams.material = elem.material;
      this.activeParams.sortamentRef = elem.sortamentRef;
      this.activeParams.system = elem.system;
      this.activeParams.elevation = elem.start[1];

      window.dispatchEvent(new CustomEvent("tool-params-sync", { detail: {
        toolType: "pipe",
        d: elem.size.d,
        material: elem.material,
        sortamentRef: elem.sortamentRef,
        system: elem.system,
        elevation: elem.start[1]
      }}));
      console.log("Pipe params inherited:", this.activeParams);
    }
  }
}
