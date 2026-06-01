import * as THREE from "three";

/**
 * ConnectionNodes — библиотека ТИПОВЫХ узлов подключения приборов (FR-CONNECT).
 * БЕЗ генерации на лету: фикс-шаблоны с ограниченными параметрами.
 *
 * Срез 1 — радиатор, «нижнее соединение»: две подводки к нижним портам.
 * Магистраль режется в точках врезки, чтобы FittingGenerator увидел настоящие T-узлы,
 * а SystemManager собрал физически связную систему.
 */

type PipeRole = "supply" | "return";

export interface RadiatorConnectionResult {
  ok: boolean;
  error?: string;
  connectionId?: string;
}

// Локальные координаты нижних портов радиатора (мм) — синхрон с DuctDrawingTool/SystemManager
const RADIATOR_PORTS = {
  supply: [50, -250, 310],
  return: [50, -250, 360],
};

export class ConnectionNodes {
  static radiatorPorts(rad: any): { supply: THREE.Vector3; return: THREE.Vector3 } {
    const pos = new THREE.Vector3(rad.position[0], rad.position[1], rad.position[2]);
    const q = new THREE.Quaternion();
    if (rad.rotation !== undefined) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rad.rotation * Math.PI) / 180);
    } else if (rad.normal) {
      q.setFromUnitVectors(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(rad.normal[0], rad.normal[1], rad.normal[2]),
      );
    }
    const toWorld = (local: number[]) =>
      new THREE.Vector3(local[0], local[1], local[2]).applyQuaternion(q).add(pos);
    return {
      supply: toWorld(RADIATOR_PORTS.supply),
      return: toWorld(RADIATOR_PORTS.return),
    };
  }

  private static pipeSegment(pipe: any) {
    return {
      a: new THREE.Vector3(pipe.start[0], pipe.start[1], pipe.start[2]),
      b: new THREE.Vector3(pipe.end[0], pipe.end[1], pipe.end[2]),
    };
  }

  private static nearestOnSeg(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
    const ab = b.clone().sub(a);
    const denom = Math.max(ab.dot(ab), 1e-9);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / denom));
    return a.clone().add(ab.multiplyScalar(t));
  }

  private static distanceToPipe(pipe: any, point: THREE.Vector3): number {
    const { a, b } = this.pipeSegment(pipe);
    return this.nearestOnSeg(point, a, b).distanceTo(point);
  }

  private static splitPipeAt(pipe: any, rawPoint: THREE.Vector3) {
    const { a, b } = this.pipeSegment(pipe);
    const splitPoint = this.nearestOnSeg(rawPoint, a, b);
    const minLeg = 50; // мм: не плодим микросегменты возле конца трубы

    if (splitPoint.distanceTo(a) < minLeg) {
      return { point: a, replacement: [pipe] };
    }
    if (splitPoint.distanceTo(b) < minLeg) {
      return { point: b, replacement: [pipe] };
    }

    const first = this.clonePipeSegment(pipe, a, splitPoint, "a");
    const second = this.clonePipeSegment(pipe, splitPoint, b, "b");
    return { point: splitPoint, replacement: [first, second] };
  }

  private static clonePipeSegment(pipe: any, start: THREE.Vector3, end: THREE.Vector3, suffix: string) {
    return {
      ...pipe,
      id: `${pipe.id}-${suffix}-${Math.round(Math.random() * 1e4)}`,
      start: [Math.round(start.x), Math.round(start.y), Math.round(start.z)],
      end: [Math.round(end.x), Math.round(end.y), Math.round(end.z)],
    };
  }

  private static chooseMains(elements: any[], rad: any, pickedPipe: any) {
    if (pickedPipe.type !== "pipe" || !pickedPipe.pairId || pickedPipe.deviceId) return null;

    const ports = this.radiatorPorts(rad);
    let supplyPipe: any | null = pickedPipe.role === "supply" ? pickedPipe : null;
    let returnPipe: any | null = pickedPipe.role === "return" ? pickedPipe : null;

    if (!supplyPipe) {
      supplyPipe = elements
        .filter((p) => p.type === "pipe" && !p.deviceId && p.id !== pickedPipe.id && p.pairId === pickedPipe.pairId && p.role === "supply")
        .sort((a, b) => this.distanceToPipe(a, ports.supply) - this.distanceToPipe(b, ports.supply))[0] || null;
    }
    if (!returnPipe) {
      returnPipe = elements
        .filter((p) => p.type === "pipe" && !p.deviceId && p.id !== pickedPipe.id && p.pairId === pickedPipe.pairId && p.role === "return")
        .sort((a, b) => this.distanceToPipe(a, ports.return) - this.distanceToPipe(b, ports.return))[0] || null;
    }

    if (!supplyPipe || !returnPipe || supplyPipe.id === returnPipe.id) return null;
    return { supplyPipe, returnPipe };
  }

  private static makePipe(
    from: THREE.Vector3,
    to: THREE.Vector3,
    main: any,
    role: PipeRole,
    connectionId: string,
    deviceId: string,
    index: number,
  ) {
    return {
      id: `pipe-conn-${role}-${Date.now()}-${Math.round(Math.random() * 1e4)}-${index}`,
      type: "pipe",
      size: { ...(main.size || { d: 20 }) },
      start: [Math.round(from.x), Math.round(from.y), Math.round(from.z)],
      end: [Math.round(to.x), Math.round(to.y), Math.round(to.z)],
      system: main.system || (role === "supply" ? "Подача" : "Обратка"),
      material: main.material || "steel_water",
      sortamentRef: main.sortamentRef || `PIPE-${main.size?.d || 20}`,
      pairId: main.pairId,
      role,
      deviceId,
      connectionId,
      connectionNodeType: "radiator_lower",
    };
  }

  private static buildRoute(
    mainPt: THREE.Vector3,
    port: THREE.Vector3,
    main: any,
    role: PipeRole,
    connectionId: string,
    deviceId: string,
  ) {
    const elbow = new THREE.Vector3(port.x, mainPt.y, port.z);
    const out: any[] = [];
    if (mainPt.distanceTo(elbow) > 10) {
      out.push(this.makePipe(mainPt, elbow, main, role, connectionId, deviceId, out.length));
    }
    if (elbow.distanceTo(port) > 10) {
      out.push(this.makePipe(elbow, port, main, role, connectionId, deviceId, out.length));
    }
    return out;
  }

  /**
   * Подключает радиатор нижним типовым узлом к выбранной двухтрубной магистрали.
   * Мутирует elements: удаляет старые подводки радиатора, режет обе трубы пары и добавляет подводки.
   */
  static connectRadiatorLower(elements: any[], rad: any, pickedPipe: any): RadiatorConnectionResult {
    const mains = this.chooseMains(elements, rad, pickedPipe);
    if (!mains) {
      return { ok: false, error: "Выберите трубу двухтрубной магистрали." };
    }

    const connectionId = `conn-radiator-lower-${rad.id}-${Date.now()}`;
    const ports = this.radiatorPorts(rad);
    const supplySplit = this.splitPipeAt(mains.supplyPipe, ports.supply);
    const returnSplit = this.splitPipeAt(mains.returnPipe, ports.return);

    for (let i = elements.length - 1; i >= 0; i--) {
      const elem = elements[i];
      if (
        elem.deviceId === rad.id ||
        elem.id === mains.supplyPipe.id ||
        elem.id === mains.returnPipe.id
      ) {
        elements.splice(i, 1);
      }
    }

    elements.push(...supplySplit.replacement, ...returnSplit.replacement);
    elements.push(...this.buildRoute(supplySplit.point, ports.supply, mains.supplyPipe, "supply", connectionId, rad.id));
    elements.push(...this.buildRoute(returnSplit.point, ports.return, mains.returnPipe, "return", connectionId, rad.id));

    rad.connectionId = connectionId;
    rad.connectionNodeType = "radiator_lower";
    return { ok: true, connectionId };
  }
}
