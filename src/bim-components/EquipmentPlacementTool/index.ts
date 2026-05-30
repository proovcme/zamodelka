import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { DuctDrawingTool } from "../DuctDrawingTool";

export interface EquipmentElement {
  id: string;
  type: "equipment";
  kind: "ahu";
  model: string;
  size: { l: number; w: number; h: number };
  position: [number, number, number]; // в мм
  rotation: number; // в градусах
}

export class EquipmentPlacementTool {
  components: OBC.Components;
  world: OBC.World;
  ductDrawingTool: DuctDrawingTool;
  
  enabled = false;
  rotationAngle = 0; // в радианах
  elevation = 0; // отметка установки по вертикали, мм
  
  projectElements: any[] = [];
  onElementsUpdated: () => void = () => {};

  // Вспомогательные 3D-объекты
  previewMesh: THREE.Mesh | null = null;
  
  private mousePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private raycaster = new THREE.Raycaster();
  private lastSnappedPoint: THREE.Vector3 | null = null;

  constructor(components: OBC.Components, world: OBC.World, ductDrawingTool: DuctDrawingTool) {
    this.components = components;
    this.world = world;
    this.ductDrawingTool = ductDrawingTool;
  }

  activate() {
    if (this.enabled) return;
    this.enabled = true;
    this.rotationAngle = 0;
    
    const container = this.world.renderer?.three.domElement.parentElement;
    if (container) {
      container.addEventListener("mousemove", this.handleMouseMove);
      container.addEventListener("pointerdown", this.handleMouseDown);
      window.addEventListener("keydown", this.handleKeyDown);
    }
    
    this.createPreview();
    console.log("Equipment placement tool activated.");

    (window as any).projectBrowserActiveTab = "params";
    window.dispatchEvent(new CustomEvent("active-tool-changed"));
  }

  deactivate() {
    if (!this.enabled) return;
    this.enabled = false;
    this.lastSnappedPoint = null;
    
    this.removePreview();
    
    const container = this.world.renderer?.three.domElement.parentElement;
    if (container) {
      container.removeEventListener("mousemove", this.handleMouseMove);
      container.removeEventListener("pointerdown", this.handleMouseDown);
      window.removeEventListener("keydown", this.handleKeyDown);
    }
    
    console.log("Equipment placement tool deactivated.");
  }

  setElements(elements: any[], updateCallback: () => void) {
    this.projectElements = elements;
    this.onElementsUpdated = updateCallback;
  }

  // Задаёт текущую отметку установки (мм) и поднимает плоскость размещения на эту высоту
  setElevation(elevationMm: number) {
    this.elevation = elevationMm;
    this.mousePlane.constant = -elevationMm / 1000;
  }

  private createPreview() {
    this.removePreview();
    
    // Вентустановка 1200 x 600 x 600 мм (в метрах: 1.2 x 0.6 x 0.6)
    const geom = new THREE.BoxGeometry(1.2, 0.6, 0.6);
    
    // Полупрозрачный оранжево-желтый материал для оборудования
    const material = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.5,
      depthTest: false
    });
    
    this.previewMesh = new THREE.Mesh(geom, material);
    this.previewMesh.visible = false;
    
    // Приподнимаем превью на половину высоты, чтобы он стоял на сетке
    this.previewMesh.geometry.translate(0, 0.3, 0);
    
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

  private handleMouseMove = (event: MouseEvent) => {
    if (!this.enabled || !this.previewMesh) return;
    
    const dom = this.world.renderer?.three.domElement;
    if (!dom) return;
    
    const rect = dom.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.world.camera.three);
    const target = new THREE.Vector3();
    
    if (this.raycaster.ray.intersectPlane(this.mousePlane, target)) {
      // Привязка к сетке с шагом 100 мм = 0.1 м
      const gridStep = 0.1;
      const snapped = new THREE.Vector3(
        Math.round(target.x / gridStep) * gridStep,
        this.elevation / 1000,
        Math.round(target.z / gridStep) * gridStep
      );
      
      this.lastSnappedPoint = snapped;
      
      // Позиционируем превью
      this.previewMesh.position.copy(snapped);
      this.previewMesh.rotation.y = this.rotationAngle;
      this.previewMesh.visible = true;
    }
  };

  private handleMouseDown = (event: PointerEvent) => {
    if (!this.enabled) return;
    
    // Сброс активной команды правой кнопкой мыши
    if (event.button === 2) {
      event.preventDefault();
      this.deactivate();
      window.dispatchEvent(new CustomEvent("tool-deactivated"));
      return;
    }
    
    if (event.button !== 0 || !this.lastSnappedPoint) return;
    
    // Размещаем оборудование
    const id = `eq-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    
    const eq: EquipmentElement = {
      id,
      type: "equipment",
      kind: "ahu",
      model: "Вентустановка ВУ-1",
      size: { l: 1200, w: 600, h: 600 },
      position: [this.lastSnappedPoint.x * 1000, this.lastSnappedPoint.y * 1000 + 0.3 * 1000, this.lastSnappedPoint.z * 1000], // центр блока: отметка основания + полувысота
      rotation: Math.round(this.rotationAngle * (180 / Math.PI)) // сохраняем в градусах
    };
    
    this.projectElements.push(eq);
    this.onElementsUpdated();
    
    console.log("Placed equipment:", eq);
    
    // Заставляем обновиться и перерисовать всю сцену
    this.ductDrawingTool.renderAll(this.projectElements);
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!this.enabled || !this.previewMesh) return;
    
    // Поворот по нажатию Пробела
    if (event.code === "Space") {
      event.preventDefault(); // отменяем скролл страницы
      
      // Добавляем 90 градусов (PI / 2)
      this.rotationAngle = (this.rotationAngle + Math.PI / 2) % (Math.PI * 2);
      
      this.previewMesh.rotation.y = this.rotationAngle;
      console.log("Rotated preview equipment to angle (deg):", Math.round(this.rotationAngle * (180 / Math.PI)));
    }
  };
}
