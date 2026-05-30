import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { Snapping, SnappingSettings } from "../Snapping";
import { SmartSnap } from "../SmartSnap";


export abstract class BaseLineTool {
  components: OBC.Components;
  world: OBC.World;

  enabled = false;
  currentStep: "idle" | "waiting-start" | "drawing" = "idle";

  // Параметры черчения
  activeParams = {
    elevation: 0, // отметка, мм
  };

  // Ссылки на общие данные элементов проекта
  projectElements: any[] = [];
  onElementsUpdated: () => void = () => {};

  // Точки в метрах (Three.js space)
  startPoint: THREE.Vector3 | null = null;
  lastSegmentDir: THREE.Vector3 | null = null;

  // Переменные для клавиатурного ввода длины
  protected lengthInputBuffer = "";
  protected inputMode: "length" | "elevation" = "length";
  protected elevationInputBuffer = "";
  protected lastSnappedMousePoint: THREE.Vector3 = new THREE.Vector3();
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Вспомогательные 3D-объекты
  snapIndicator: THREE.Mesh | null = null;
  previewMesh: THREE.Mesh | null = null;

  // Настройки привязки
  snappingSettings: SnappingSettings = {
    gridStep: 0.1,       // 100 мм
    angleStepDeg: 5,     // 5 градусов
    snapThreshold: 0.25, // 250 мм
  };

  protected mousePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  protected raycaster = new THREE.Raycaster();

  private smartSnap = new SmartSnap();


  // CAD подсказка у курсора
  private cadTooltip: HTMLDivElement | null = null;

  constructor(components: OBC.Components, world: OBC.World) {
    this.components = components;
    this.world = world;

    // Создаем индикатор привязки (светящийся шарик)
    const indicatorGeom = new THREE.SphereGeometry(0.1, 16, 16);
    const indicatorMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      depthTest: false,
      transparent: true,
      opacity: 0.8,
    });
    this.snapIndicator = new THREE.Mesh(indicatorGeom, indicatorMat);
    this.snapIndicator.visible = false;
    this.world.scene.three.add(this.snapIndicator);
  }

  activate() {
    if (this.enabled) return;
    this.enabled = true;
    this.currentStep = "waiting-start";

    const container = this.world.renderer?.three.domElement.parentElement;
    if (container) {
      container.addEventListener("mousemove", this.handleMouseMove);
      container.addEventListener("pointerdown", this.handleMouseDown);
    }
    window.addEventListener("keydown", this.handleKeyDown);

    this.createCadTooltip();
    console.log(`${this.constructor.name} activated.`);
  }

  deactivate() {
    if (!this.enabled) return;
    this.enabled = false;
    this.currentStep = "idle";
    this.startPoint = null;
    this.lastSegmentDir = null;
    this.lengthInputBuffer = "";
    this.elevationInputBuffer = "";
    this.inputMode = "length";

    this.removePreview();
    if (this.snapIndicator) {
      this.snapIndicator.visible = false;
    }

    this.smartSnap.clearGuides(this.world.scene.three);

    const container = this.world.renderer?.three.domElement.parentElement;
    if (container) {
      container.removeEventListener("mousemove", this.handleMouseMove);
      container.removeEventListener("pointerdown", this.handleMouseDown);
    }
    window.removeEventListener("keydown", this.handleKeyDown);

    this.removeCadTooltip();
    console.log(`${this.constructor.name} deactivated.`);
  }

  setElements(elements: any[], updateCallback: () => void) {
    this.projectElements = elements;
    this.onElementsUpdated = updateCallback;
  }

  setElevation(elevationMm: number) {
    this.activeParams.elevation = elevationMm;
    this.mousePlane.constant = -elevationMm / 1000;
  }

  setSnappingSettings(settings: Partial<SnappingSettings>) {
    this.snappingSettings = { ...this.snappingSettings, ...settings };
  }

  protected handleMouseMove = (event: MouseEvent) => {
    if (!this.enabled || this.currentStep === "idle") return;

    const intersection = this.getMouseIntersection(event);
    if (!intersection) {
      if (this.snapIndicator) this.snapIndicator.visible = false;
      this.hideCadTooltip();
      return;
    }

    // Сохраняем положение курсора
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;

    // 1. Сначала привязываем точку к сетке/узлам
    let snappedPoint = Snapping.applySnapping(
      intersection,
      this.activeParams.elevation,
      this.projectElements,
      this.snappingSettings
    );

    // 1b. Smart alignment snapping (Miro/Visio style)
    const { snapped: smartSnapped, guides } = this.smartSnap.snap(
      snappedPoint,
      this.projectElements
    );
    snappedPoint = smartSnapped;
    this.smartSnap.renderGuides(guides, this.world.scene.three);

    this.lastSnappedMousePoint.copy(snappedPoint);

    let isInvalidAngle = false;

    // 2. Если мы в режиме рисования (есть стартовая точка), применяем привязку угла к шагу 5°
    if (this.currentStep === "drawing" && this.startPoint) {
      snappedPoint = Snapping.applyAngleSnapping(
        this.startPoint,
        snappedPoint,
        this.snappingSettings.angleStepDeg
      );

      this.lastSnappedMousePoint.copy(snappedPoint);

      // Проверяем запрет острых/обратных углов
      const newDir = new THREE.Vector3().subVectors(snappedPoint, this.startPoint).normalize();
      newDir.y = 0;

      if (this.lastSegmentDir && this.lastSegmentDir.dot(newDir) < -0.708) {
        isInvalidAngle = true;
      }

      this.updatePreview(this.startPoint, snappedPoint, isInvalidAngle);
      this.showCadTooltip(event, this.startPoint, snappedPoint, isInvalidAngle);
    } else {
      this.hideCadTooltip();
    }

    // Отображаем индикатор в конечной привязанной точке
    if (this.snapIndicator) {
      this.snapIndicator.position.copy(snappedPoint);
      this.snapIndicator.visible = true;
    }
  };

  protected handleMouseDown = (event: PointerEvent) => {
    if (!this.enabled || this.currentStep === "idle") return;

    // Правый клик — отмена / сброс
    if (event.button === 2) {
      event.preventDefault();
      this.deactivate();
      window.dispatchEvent(new CustomEvent("tool-deactivated"));
      return;
    }

    if (event.button !== 0) return;

    const intersection = this.getMouseIntersection(event);
    if (!intersection) return;

    let snappedPoint = Snapping.applySnapping(
      intersection,
      this.activeParams.elevation,
      this.projectElements,
      this.snappingSettings
    );

    if (this.currentStep === "waiting-start") {
      this.startPoint = snappedPoint.clone();
      
      // Наследуем параметры существующего элемента при привязке к его узлу
      const closestNode = Snapping.findClosestNode(intersection, this.projectElements, this.snappingSettings.snapThreshold);
      if (closestNode) {
        const closestElem = this.findClosestElementToNode(closestNode);
        if (closestElem) {
          this.inheritParameters(closestElem);
        }
      }
      
      this.lastSegmentDir = null;
      this.currentStep = "drawing";
      console.log("Start point set:", this.startPoint);
    } else if (this.currentStep === "drawing" && this.startPoint) {
      // Применяем привязку угла
      snappedPoint = Snapping.applyAngleSnapping(
        this.startPoint,
        snappedPoint,
        this.snappingSettings.angleStepDeg
      );

      if (this.startPoint.distanceTo(snappedPoint) < 0.1) {
        console.log("Start and End points are too close.");
        return;
      }

      const newDir = new THREE.Vector3().subVectors(snappedPoint, this.startPoint).normalize();
      newDir.y = 0;

      // Проверка острого угла (>135° поворота)
      if (this.lastSegmentDir && this.lastSegmentDir.dot(newDir) < -0.708) {
        console.warn("Слишком острый/обратный угол (>135°) запрещён. Точка отклонена.");
        window.dispatchEvent(new CustomEvent("duct-angle-rejected"));
        return;
      }

      // Сохраняем сегмент (реализуется наследником)
      this.saveSegment(this.startPoint, snappedPoint);

      this.lastSegmentDir = newDir;
      this.startPoint = snappedPoint.clone();
      this.removePreview();
    }
  };

  private showCadTooltipAtLastMouse() {
    if (!this.startPoint || !this.lastSnappedMousePoint) return;
    
    let isInvalidAngle = false;
    const newDir = new THREE.Vector3().subVectors(this.lastSnappedMousePoint, this.startPoint).normalize();
    newDir.y = 0;
    if (this.lastSegmentDir && this.lastSegmentDir.dot(newDir) < -0.708) {
      isInvalidAngle = true;
    }

    const mockEvent = { clientX: this.lastMouseX, clientY: this.lastMouseY } as MouseEvent;
    this.showCadTooltip(mockEvent, this.startPoint, this.lastSnappedMousePoint, isInvalidAngle);
  }

  protected handleKeyDown = (event: KeyboardEvent) => {
    if (!this.enabled) return;

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

    // Поддержка быстрого переключения уровней через Tab
    if (event.key === "Tab") {
      event.preventDefault();
      
      if (this.currentStep === "drawing" && this.startPoint) {
        // Переключаем режим ввода при рисовании
        this.inputMode = this.inputMode === "length" ? "elevation" : "length";
        this.showCadTooltipAtLastMouse();
        return;
      }
      
      const levels = (window as any).projectLevels || {};
      const levelsArray = Object.entries(levels).map(([name, val]) => ({ name, val: Number(val) }));
      
      if (levelsArray.length > 0) {
        levelsArray.sort((a, b) => a.val - b.val);
        const currentElev = this.activeParams.elevation;
        let nextIndex = 0;
        
        const currentIndex = levelsArray.findIndex(l => l.val === currentElev);
        if (currentIndex !== -1) {
          nextIndex = (currentIndex + 1) % levelsArray.length;
        }
        
        const nextLevel = levelsArray[nextIndex];
        window.dispatchEvent(new CustomEvent("elevation-updated", { detail: { elevation: nextLevel.val } }));
        console.log(`Tab height shift: switched to ${nextLevel.name} (${nextLevel.val} mm)`);
      }
      return;
    }

    if (this.currentStep === "drawing" && this.startPoint) {
      // Если нажимают цифры
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        if (this.inputMode === "length") {
          this.lengthInputBuffer += event.key;
        } else {
          this.elevationInputBuffer += event.key;
        }
        this.showCadTooltipAtLastMouse();
        return;
      }

      // Backspace
      if (event.key === "Backspace") {
        event.preventDefault();
        if (this.inputMode === "length") {
          this.lengthInputBuffer = this.lengthInputBuffer.slice(0, -1);
        } else {
          this.elevationInputBuffer = this.elevationInputBuffer.slice(0, -1);
        }
        this.showCadTooltipAtLastMouse();
        return;
      }

      // Escape сбрасывает буфер ввода, если он заполнен
      if (event.key === "Escape") {
        if (this.inputMode === "length" && this.lengthInputBuffer) {
          event.preventDefault();
          this.lengthInputBuffer = "";
          this.showCadTooltipAtLastMouse();
          return;
        } else if (this.inputMode === "elevation" && this.elevationInputBuffer) {
          event.preventDefault();
          this.elevationInputBuffer = "";
          this.showCadTooltipAtLastMouse();
          return;
        }
      }

      // Enter подтверждает ввод длины или отметки
      if (event.key === "Enter") {
        if (this.inputMode === "length" && this.lengthInputBuffer) {
          event.preventDefault();
          const parsedLength = parseInt(this.lengthInputBuffer, 10);
          this.lengthInputBuffer = "";

          if (isNaN(parsedLength) || parsedLength <= 0) {
            console.warn("Некорректная длина:", parsedLength);
            return;
          }

          const lengthM = parsedLength / 1000;
          const dir = new THREE.Vector3().subVectors(this.lastSnappedMousePoint, this.startPoint).normalize();
          dir.y = 0;

          if (dir.lengthSq() < 1e-6) {
            // Если мышка лежит прямо на стартовой точке, берем направление предыдущего сегмента или ось X
            dir.copy(this.lastSegmentDir || new THREE.Vector3(1, 0, 0));
          }

          // Проверяем запрет острых углов
          if (this.lastSegmentDir && this.lastSegmentDir.dot(dir) < -0.708) {
            console.warn("Слишком острый/обратный угол (>135°) запрещён.");
            window.dispatchEvent(new CustomEvent("duct-angle-rejected"));
            return;
          }

          const targetPoint = this.startPoint.clone().addScaledVector(dir, lengthM);

          // Сохраняем сегмент
          this.saveSegment(this.startPoint, targetPoint);

          this.lastSegmentDir = dir;
          this.startPoint = targetPoint.clone();
          this.removePreview();
          this.hideCadTooltip();
          
          // Обновляем превью от новой точки
          this.updatePreview(this.startPoint, this.lastSnappedMousePoint, false);
          return;
        } else if (this.inputMode === "elevation" && this.elevationInputBuffer) {
          event.preventDefault();
          const parsedElevation = parseInt(this.elevationInputBuffer, 10);
          this.elevationInputBuffer = "";
          this.inputMode = "length";

          if (isNaN(parsedElevation)) {
            console.warn("Некорректная отметка:", parsedElevation);
            return;
          }

          // Обновляем параметры высоты черчения
          this.activeParams.elevation = parsedElevation;
          this.mousePlane.constant = -(parsedElevation / 1000);

          // Строим вертикальный подъем/опуск!
          // Точка у нас лежит на тех же X и Z, что и startPoint, но Y равен новой отметке!
          const targetPoint = this.startPoint.clone();
          targetPoint.y = parsedElevation / 1000;

          // Сохраняем сегмент
          this.saveSegment(this.startPoint, targetPoint);

          this.startPoint = targetPoint.clone();
          this.removePreview();
          this.hideCadTooltip();

          // Оповещаем UI об изменении отметки
          window.dispatchEvent(new CustomEvent("elevation-updated", { detail: { elevation: parsedElevation } }));

          // Обновляем превью от новой точки
          this.updatePreview(this.startPoint, this.lastSnappedMousePoint, false);
          return;
        }
      }
    }

    if (event.key === "Escape") {
      this.deactivate();
      window.dispatchEvent(new CustomEvent("tool-deactivated"));
    }
  };

  protected getMouseIntersection(event: MouseEvent): THREE.Vector3 | null {
    const dom = this.world.renderer?.three.domElement;
    if (!dom) return null;

    const rect = dom.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.world.camera.three);
    const target = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.mousePlane, target)) {
      return target;
    }
    return null;
  }

  // --- CAD Tooltip Methods ---

  private createCadTooltip() {
    if (this.cadTooltip) return;

    this.cadTooltip = document.createElement("div");
    this.cadTooltip.id = "baseline-tool-cad-tooltip";
    this.cadTooltip.style.position = "absolute";
    this.cadTooltip.style.background = "rgba(15, 23, 42, 0.9)";
    this.cadTooltip.style.border = "1px solid rgba(148, 163, 184, 0.4)";
    this.cadTooltip.style.borderRadius = "4px";
    this.cadTooltip.style.padding = "4px 8px";
    this.cadTooltip.style.color = "#ffffff";
    this.cadTooltip.style.fontFamily = "system-ui, -apple-system, sans-serif";
    this.cadTooltip.style.fontSize = "11px";
    this.cadTooltip.style.fontWeight = "500";
    this.cadTooltip.style.pointerEvents = "none";
    this.cadTooltip.style.zIndex = "9999";
    this.cadTooltip.style.display = "none";
    this.cadTooltip.style.boxShadow = "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)";

    document.body.appendChild(this.cadTooltip);
  }

  private removeCadTooltip() {
    if (this.cadTooltip) {
      this.cadTooltip.remove();
      this.cadTooltip = null;
    }
  }

  private showCadTooltip(
    event: MouseEvent,
    start: THREE.Vector3,
    end: THREE.Vector3,
    isInvalidAngle: boolean
  ) {
    if (!this.cadTooltip) return;

    const lengthM = start.distanceTo(end);
    const lengthMm = Math.round(lengthM * 1000);

    const dir = new THREE.Vector3().subVectors(end, start);
    dir.y = 0;
    dir.normalize();

    let angleDeg = 0;
    if (this.lastSegmentDir) {
      // Угол поворота относительно предыдущего сегмента
      const angleRad = this.lastSegmentDir.angleTo(dir);
      angleDeg = Math.round((angleRad * 180) / Math.PI);
      
      // Определяем направление поворота через векторное произведение
      const cross = new THREE.Vector3().crossVectors(this.lastSegmentDir, dir);
      if (cross.y < 0) {
        angleDeg = -angleDeg;
      }
    } else {
      // Абсолютный угол относительно оси X
      const angleRad = Math.atan2(dir.z, dir.x);
      angleDeg = Math.round((angleRad * 180) / Math.PI);
      if (angleDeg < 0) angleDeg += 360;
    }

    let tooltipContent = `
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <div>Длина: <span style="color: var(--bim-ui_accent-base, #38bdf8); font-weight: bold;">${lengthMm} мм</span></div>
        <div>Угол: <span style="color: #34d399; font-weight: bold;">${Math.abs(angleDeg)}°</span></div>
    `;

    if (this.inputMode === "length" && this.lengthInputBuffer) {
      tooltipContent += `
        <div style="margin-top: 4px; border-top: 1px solid rgba(255, 255, 255, 0.2); padding-top: 4px; display: flex; flex-direction: column; gap: 2px;">
          <div style="color: #fbbf24; font-weight: bold;">⌨️ Ввод длины:</div>
          <div style="font-size: 13px; color: #fbbf24; font-weight: 800; background: rgba(0,0,0,0.4); padding: 2px 4px; border-radius: 2px; text-align: center;">
            ${this.lengthInputBuffer} мм
          </div>
          <div style="font-size: 9px; color: #94a3b8; text-align: center; margin-top: 1px;">[Enter] - построить, [Tab] - ввести отметку, [Esc] - сбросить</div>
        </div>
      `;
    } else if (this.inputMode === "elevation") {
      tooltipContent += `
        <div style="margin-top: 4px; border-top: 1px solid rgba(255, 255, 255, 0.2); padding-top: 4px; display: flex; flex-direction: column; gap: 2px;">
          <div style="color: #fbbf24; font-weight: bold;">⌨️ Ввод отметки:</div>
          <div style="font-size: 13px; color: #fbbf24; font-weight: 800; background: rgba(0,0,0,0.4); padding: 2px 4px; border-radius: 2px; text-align: center;">
            ${this.elevationInputBuffer || "0"} мм
          </div>
          <div style="font-size: 9px; color: #94a3b8; text-align: center; margin-top: 1px;">[Enter] - применить, [Tab] - ввести длину, [Esc] - сбросить</div>
        </div>
      `;
    }

    if (isInvalidAngle) {
      tooltipContent += `
        <div style="color: #ef4444; font-weight: bold; margin-top: 2px; border-top: 1px solid rgba(239, 68, 68, 0.3); padding-top: 2px;">
          ⚠️ Острый угол!
        </div>
      `;
    }

    tooltipContent += `</div>`;

    this.cadTooltip.innerHTML = tooltipContent;
    this.cadTooltip.style.display = "block";
    this.cadTooltip.style.left = `${event.clientX + 15}px`;
    this.cadTooltip.style.top = `${event.clientY + 15}px`;
  }

  private hideCadTooltip() {
    if (this.cadTooltip) {
      this.cadTooltip.style.display = "none";
    }
  }

  // --- Abstract / Virtual Methods ---

  protected abstract updatePreview(
    start: THREE.Vector3,
    end: THREE.Vector3,
    isInvalidAngle: boolean
  ): void;

  protected abstract removePreview(): void;

  protected abstract saveSegment(start: THREE.Vector3, end: THREE.Vector3): void;

  protected findClosestElementToNode(node: THREE.Vector3): any | null {
    const threshold = 0.01; // 10 мм
    for (const elem of this.projectElements) {
      if (elem.start && elem.end) {
        const pStart = new THREE.Vector3(elem.start[0] / 1000, elem.start[1] / 1000, elem.start[2] / 1000);
        const pEnd = new THREE.Vector3(elem.end[0] / 1000, elem.end[1] / 1000, elem.end[2] / 1000);
        if (pStart.distanceTo(node) < threshold || pEnd.distanceTo(node) < threshold) {
          return elem;
        }
      }
    }
    return null;
  }

  protected inheritParameters(_elem: any): void {
    // Переопределяется в наследниках для автонаследования свойств трассы
  }
}
