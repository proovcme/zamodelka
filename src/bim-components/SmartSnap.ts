import * as THREE from "three";

export interface SnapGuide {
  from: THREE.Vector3;
  to: THREE.Vector3;
  axis: "x" | "z" | "wall";
}

export class SmartSnap {
  snapThreshold = 0.3; // 300mm in meters

  private guideLines: THREE.Object3D[] = [];

  /**
   * Snap a candidate point to alignment guides from other elements.
   * Also supports wall parallel alignment if faceOffset is provided.
   * Returns the snapped point and guide lines to render.
   */
  snap(
    candidatePoint: THREE.Vector3,
    elements: any[],
    options?: {
      faceOffset?: number; // in mm
      excludeId?: string;
    }
  ): { snapped: THREE.Vector3; guides: SnapGuide[]; wallSnapped: boolean } {
    const guides: SnapGuide[] = [];
    const snapped = candidatePoint.clone();
    let wallSnapped = false;

    // 1. Wall parallel alignment snapping (Highest priority)
    if (options?.faceOffset !== undefined) {
      let closestWall: any = null;
      let minWallDist = 0.4; // 400 mm threshold
      let snapProj = new THREE.Vector3();
      let snapOffsetDir = new THREE.Vector3();
      let wallOffset = 0.2;

      for (const elem of elements) {
        if (elem.type === "wall" && elem.start && elem.end) {
          const wStart = new THREE.Vector3(elem.start[0] / 1000, candidatePoint.y, elem.start[2] / 1000);
          const wEnd = new THREE.Vector3(elem.end[0] / 1000, candidatePoint.y, elem.end[2] / 1000);

          const wallDir = new THREE.Vector3().subVectors(wEnd, wStart).normalize();
          const toPoint = new THREE.Vector3().subVectors(candidatePoint, wStart);
          const len = wStart.distanceTo(wEnd);

          let t = toPoint.dot(wallDir);
          t = Math.max(0, Math.min(len, t));

          const proj = wStart.clone().addScaledVector(wallDir, t);
          const dist = candidatePoint.distanceTo(proj);

          if (dist < minWallDist) {
            minWallDist = dist;
            closestWall = elem;
            snapProj.copy(proj);

            const perp = new THREE.Vector3(-wallDir.z, 0, wallDir.x).normalize();
            const toSnapped = new THREE.Vector3().subVectors(candidatePoint, proj);
            if (toSnapped.dot(perp) >= 0) {
              snapOffsetDir.copy(perp);
            } else {
              snapOffsetDir.copy(perp).negate();
            }

            const thickness = elem.thickness || 200;
            wallOffset = (thickness / 2 + options.faceOffset) / 1000; // in meters
          }
        }
      }

      if (closestWall) {
        snapped.copy(snapProj).addScaledVector(snapOffsetDir, wallOffset);
        wallSnapped = true;

        // Create a wall parallel snap guide line
        const wStart = new THREE.Vector3(closestWall.start[0] / 1000, snapped.y, closestWall.start[2] / 1000);
        const wEnd = new THREE.Vector3(closestWall.end[0] / 1000, snapped.y, closestWall.end[2] / 1000);
        const wallDir = new THREE.Vector3().subVectors(wEnd, wStart).normalize();

        const guideStart = snapped.clone().addScaledVector(wallDir, -5);
        const guideEnd = snapped.clone().addScaledVector(wallDir, 5);

        guides.push({
          from: guideStart,
          to: guideEnd,
          axis: "wall",
        });
      }
    }

    // 2. Standard X/Z alignment smart snapping (if not snapped to wall)
    if (!wallSnapped) {
      let bestDX = Infinity;
      let bestDZ = Infinity;
      let snapX: number | null = null;
      let snapZ: number | null = null;

      for (const elem of elements) {
        if (options?.excludeId && elem.id === options.excludeId) continue;

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
    }

    return { snapped, guides, wallSnapped };
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
      if (guide.axis === "wall") {
        const tube = this.createGuideTube(guide.from, guide.to, 0x22d3ee, 0.32, 0.018);
        tube.userData.isSmartSnapGuide = true;
        scene.add(tube);
        this.guideLines.push(tube);
      } else {
        const points = [guide.from, guide.to];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.75,
          depthTest: false,
        });

        const line = new THREE.Line(geometry, material);
        line.userData.isSmartSnapGuide = true;
        scene.add(line);
        this.guideLines.push(line);
      }
    }
  }

  private createGuideTube(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color: number,
    opacity: number,
    radius: number
  ): THREE.Mesh {
    const distance = from.distanceTo(to);
    const center = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    const geom = new THREE.CylinderGeometry(radius, radius, Math.max(distance, 0.001), 16);
    geom.rotateX(Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
    });

    const mesh = new THREE.Mesh(geom, material);
    mesh.position.copy(center);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    return mesh;
  }

  /**
   * Remove all guide lines from the scene.
   */
  clearGuides(scene: THREE.Object3D): void {
    for (const guide of this.guideLines) {
      guide.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat: THREE.Material) => mat.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      scene.remove(guide);
    }
    this.guideLines = [];
  }
}
