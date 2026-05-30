import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { BaseLineTool } from "../BaseLineTool";

export interface WallElement {
  id: string;
  type: "wall";
  start: [number, number, number]; // в мм
  end: [number, number, number];   // в мм
  height: number;                  // в мм
  thickness: number;               // в мм
  material: string;
}

export class WallDrawingTool extends BaseLineTool {
  // Параметры черчения стен (расширение базового класса)
  activeParams = {
    height: 3000,          // в мм
    thickness: 200,        // в мм
    material: "brick",     // "brick" | "concrete" | "gypsum"
    elevation: 0,          // в мм
  };

  constructor(components: OBC.Components, world: OBC.World) {
    super(components, world);
  }

  protected updatePreview(start: THREE.Vector3, end: THREE.Vector3, isInvalidAngle: boolean) {
    this.removePreview();
    
    this.previewMesh = this.createWallMesh(
      start,
      end,
      this.activeParams.height / 1000,
      this.activeParams.thickness / 1000,
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
    const id = `wall-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    
    const wall: WallElement = {
      id,
      type: "wall",
      start: [start.x * 1000, start.y * 1000, start.z * 1000],
      end: [end.x * 1000, end.y * 1000, end.z * 1000],
      height: this.activeParams.height,
      thickness: this.activeParams.thickness,
      material: this.activeParams.material
    };
    
    this.projectElements.push(wall);
    
    // Перерисовываем всю сцену с помощью центрального DuctDrawingTool
    const ductTool = (window as any).ductDrawingTool;
    if (ductTool) {
      ductTool.renderAll(this.projectElements);
    }
    
    this.onElementsUpdated();
    
    console.log("Wall segment saved.");
  }

  // --- Geometry Helper ---

  private createWallMesh(
    start: THREE.Vector3,
    end: THREE.Vector3,
    height: number,
    thickness: number,
    isPreview = false,
    isInvalidAngle = false
  ): THREE.Mesh {
    const distance = start.distanceTo(end);
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    // Приподнимаем центр стены по высоте, так как Y — это уровень пола
    center.y += height / 2;
    
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    dir.y = 0;
    
    const geom = new THREE.BoxGeometry(thickness, height, distance);
    const material = new THREE.MeshStandardMaterial({
      color: isPreview ? (isInvalidAngle ? 0xef4444 : 0x00aaff) : 0x94a3b8,
      roughness: 0.8,
      metalness: 0.05,
      transparent: isPreview,
      opacity: isPreview ? 0.6 : 1.0,
    });
    
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.copy(center);
    
    // Выравниваем по направлению движения
    const defaultDir = new THREE.Vector3(0, 0, 1);
    mesh.quaternion.setFromUnitVectors(defaultDir, dir);
    
    return mesh;
  }
}
