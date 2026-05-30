import * as THREE from "three";

export interface SnappingSettings {
  gridStep: number;        // в метрах (например, 0.1 для 100мм)
  angleStepDeg: number;    // в градусах (например, 5)
  snapThreshold: number;   // в метрах (например, 0.25 для 250мм)
}

export class Snapping {
  /**
   * Находит ближайший узел среди существующих элементов (воздуховоды, стены)
   */
  static findClosestNode(
    point: THREE.Vector3,
    projectElements: any[],
    snapThreshold: number = 0.25
  ): THREE.Vector3 | null {
    let closestNode: THREE.Vector3 | null = null;
    let minDistance = snapThreshold;

    for (const elem of projectElements) {
      if (elem.type === "duct" || elem.type === "wall" || elem.type === "tray" || elem.type === "pipe") {
        if (!elem.start || !elem.end) continue;

        const pStart = new THREE.Vector3(
          elem.start[0] / 1000,
          elem.start[1] / 1000,
          elem.start[2] / 1000
        );
        const pEnd = new THREE.Vector3(
          elem.end[0] / 1000,
          elem.end[1] / 1000,
          elem.end[2] / 1000
        );

        const distStart = point.distanceTo(pStart);
        if (distStart < minDistance) {
          minDistance = distStart;
          closestNode = pStart;
        }

        const distEnd = point.distanceTo(pEnd);
        if (distEnd < minDistance) {
          minDistance = distEnd;
          closestNode = pEnd;
        }
      }
    }

    return closestNode;
  }

  /**
   * Находит ближайшую точку на телах (отрезках) существующих элементов (воздуховоды, стены, лотки, трубы)
   */
  static findClosestPointOnSegments(
    point: THREE.Vector3,
    projectElements: any[],
    snapThreshold: number = 0.25
  ): THREE.Vector3 | null {
    let closestPoint: THREE.Vector3 | null = null;
    let minDistance = snapThreshold;

    for (const elem of projectElements) {
      if (elem.type === "wall" || elem.type === "duct" || elem.type === "tray" || elem.type === "pipe") {
        if (!elem.start || !elem.end) continue;

        const pStart = new THREE.Vector3(
          elem.start[0] / 1000,
          elem.start[1] / 1000,
          elem.start[2] / 1000
        );
        const pEnd = new THREE.Vector3(
          elem.end[0] / 1000,
          elem.end[1] / 1000,
          elem.end[2] / 1000
        );

        // Вектор отрезка
        const v = new THREE.Vector3().subVectors(pEnd, pStart);
        const u = new THREE.Vector3().subVectors(point, pStart);

        const lenSq = v.lengthSq();
        if (lenSq < 1e-6) continue;

        // Коэффициент проекции t от 0 до 1
        let t = u.dot(v) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const projection = new THREE.Vector3().copy(pStart).addScaledVector(v, t);
        const dist = point.distanceTo(projection);

        if (dist < minDistance) {
          minDistance = dist;
          closestPoint = projection;
        }
      }
    }

    return closestPoint;
  }

  /**
   * Применяет базовые привязки: сначала к вершинам узлов, затем к телам сегментов, затем к сетке.
   */
  static applySnapping(
    point: THREE.Vector3,
    currentElevationMm: number,
    projectElements: any[],
    settings: SnappingSettings = { gridStep: 0.1, angleStepDeg: 5, snapThreshold: 0.25 }
  ): THREE.Vector3 {
    // 1. Привязка к существующим узлам (высший приоритет)
    const closestNode = this.findClosestNode(point, projectElements, settings.snapThreshold);
    if (closestNode) {
      return closestNode.clone();
    }

    // 2. Привязка к телам отрезков/стен (средний приоритет)
    const closestSegmentPoint = this.findClosestPointOnSegments(point, projectElements, settings.snapThreshold);
    if (closestSegmentPoint) {
      return closestSegmentPoint.clone();
    }

    // 3. Привязка к сетке (низший приоритет)
    const result = point.clone();
    result.x = Math.round(result.x / settings.gridStep) * settings.gridStep;
    result.z = Math.round(result.z / settings.gridStep) * settings.gridStep;
    result.y = currentElevationMm / 1000;

    return result;
  }

  /**
   * Привязывает направление вектора (от startPoint к endPoint) в горизонтальной плоскости XZ
   * к ближайшему кратному углу (например, с шагом 5 градусов).
   */
  static applyAngleSnapping(
    startPoint: THREE.Vector3,
    endPoint: THREE.Vector3,
    angleStepDeg: number = 5
  ): THREE.Vector3 {
    const currentDir = new THREE.Vector3().subVectors(endPoint, startPoint);
    currentDir.y = 0; // Нам нужен только горизонтальный угол

    const length = currentDir.length();
    if (length < 0.01) {
      return endPoint.clone();
    }

    currentDir.normalize();

    // Находим абсолютный угол в XZ плоскости
    const angleRad = Math.atan2(currentDir.z, currentDir.x);
    const stepRad = (angleStepDeg * Math.PI) / 180;
    
    // Округляем угол до кратного шага
    const snappedAngleRad = Math.round(angleRad / stepRad) * stepRad;

    // Восстанавливаем вектор по округленному углу
    currentDir.x = Math.cos(snappedAngleRad);
    currentDir.z = Math.sin(snappedAngleRad);

    const result = startPoint.clone().addScaledVector(currentDir, length);
    // Y остается равным стартовому, так как черчение происходит в горизонтальной плоскости
    result.y = startPoint.y;

    return result;
  }
}
