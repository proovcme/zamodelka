import * as THREE from "three";

export interface SnapGuide {
  from: THREE.Vector3;
  to: THREE.Vector3;
  axis: "x" | "z";
}

export class SmartSnap {
  snapThreshold = 0.3; // 300mm in meters

  private guideLines: THREE.Line[] = [];

  /**
   * Snap a candidate point to alignment guides from other elements.
   * Returns the snapped point and guide lines to render.
   */
  snap(
    candidatePoint: THREE.Vector3,
    elements: any[],
    excludeId?: string
  ): { snapped: THREE.Vector3; guides: SnapGuide[] } {
    const guides: SnapGuide[] = [];
    const snapped = candidatePoint.clone();

    let bestDX = Infinity;
    let bestDZ = Infinity;
    let snapX: number | null = null;
    let snapZ: number | null = null;

    for (const elem of elements) {
      if (excludeId && elem.id === excludeId) continue;

      const refPoints = this.getReferencePoints(elem);

      for (const ref of refPoints) {
        const dx = Math.abs(candidatePoint.x - ref.x);
        const dz = Math.abs(candidatePoint.z - ref.z);

        if (dx < this.snapThreshold && dx < bestDX) {
          bestDX = dx;
          snapX = ref.x;
        }

        if (dz < this.snapThreshold && dz < bestDZ) {
          bestDZ = dz;
          snapZ = ref.z;
        }
      }
    }

    if (snapX !== null) {
      const guideY = candidatePoint.y;
      guides.push({
        from: new THREE.Vector3(snapX, guideY, candidatePoint.z - 5),
        to: new THREE.Vector3(snapX, guideY, candidatePoint.z + 5),
        axis: "x",
      });
      snapped.x = snapX;
    }

    if (snapZ !== null) {
      const guideY = candidatePoint.y;
      guides.push({
        from: new THREE.Vector3(candidatePoint.x - 5, guideY, snapZ),
        to: new THREE.Vector3(candidatePoint.x + 5, guideY, snapZ),
        axis: "z",
      });
      snapped.z = snapZ;
    }

    return { snapped, guides };
  }

  /**
   * Get reference alignment points from an element.
   */
  private getReferencePoints(elem: any): Array<{ x: number; z: number }> {
    const pts: Array<{ x: number; z: number }> = [];

    if (elem.position && Array.isArray(elem.position)) {
      // Positioned elements: position in mm → convert to meters
      pts.push({
        x: elem.position[0] / 1000,
        z: elem.position[2] / 1000,
      });
    } else if (
      elem.start &&
      elem.end &&
      Array.isArray(elem.start) &&
      Array.isArray(elem.end)
    ) {
      // Line elements: use midpoint
      pts.push({
        x: (elem.start[0] + elem.end[0]) / 2 / 1000,
        z: (elem.start[2] + elem.end[2]) / 2 / 1000,
      });
    }

    return pts;
  }

  /**
   * Render alignment guide lines in the scene.
   */
  renderGuides(guides: SnapGuide[], scene: THREE.Object3D): void {
    this.clearGuides(scene);

    for (const guide of guides) {
      const points = [guide.from, guide.to];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      });
      const line = new THREE.Line(geometry, material);
      line.userData.isSmartSnapGuide = true;
      scene.add(line);
      this.guideLines.push(line);
    }
  }

  /**
   * Remove all guide lines from the scene.
   */
  clearGuides(scene: THREE.Object3D): void {
    for (const line of this.guideLines) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      scene.remove(line);
    }
    this.guideLines = [];
  }
}
