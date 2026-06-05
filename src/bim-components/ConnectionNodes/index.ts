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

// Локальные координаты портов приборов (мм) — синхрон с DuctDrawingTool/SystemManager/TwoPipe.
// Все 2-портовые приборы (подача/обратка) подключаются ОДНИМ узлом-builder'ом «прибор→пара труб».
const DEVICE_PORTS: Record<string, { supply: number[]; return: number[] }> = {
  radiator: { supply: [50, -250, 310], return: [50, -250, 360] },
  ac: { supply: [110, -100, 150], return: [110, -100, 200] },
  ac_ceiling: { supply: [370, 150, -50], return: [370, 150, 50] },
  equipment: { supply: [600, 0, 0], return: [-600, 0, 0] },
  vrv_outdoor: { supply: [-400, 200, 200], return: [-400, 200, -200] },
};

export class ConnectionNodes {
  // Мировые координаты портов любого 2-портового прибора (мм).
  static devicePorts(device: any): { supply: THREE.Vector3; return: THREE.Vector3 } | null {
    const locals = DEVICE_PORTS[device?.type];
    if (!locals || !device.position) return null;
    const pos = new THREE.Vector3(device.position[0], device.position[1], device.position[2]);
    const q = new THREE.Quaternion();
    if (device.rotation !== undefined) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (device.rotation * Math.PI) / 180);
    } else if (device.normal) {
      q.setFromUnitVectors(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(device.normal[0], device.normal[1], device.normal[2]),
      );
    }
    const toWorld = (local: number[]) =>
      new THREE.Vector3(local[0], local[1], local[2]).applyQuaternion(q).add(pos);
    return { supply: toWorld(locals.supply), return: toWorld(locals.return) };
  }

  // Совместимость: порты радиатора через общий devicePorts.
  static radiatorPorts(rad: any): { supply: THREE.Vector3; return: THREE.Vector3 } {
    return this.devicePorts(rad) || { supply: new THREE.Vector3(), return: new THREE.Vector3() };
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
    nodeType: string,
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
      connectionNodeType: nodeType,
    };
  }

  private static buildRoute(
    mainPt: THREE.Vector3,
    port: THREE.Vector3,
    main: any,
    role: PipeRole,
    connectionId: string,
    deviceId: string,
    nodeType: string,
  ) {
    const elbow = new THREE.Vector3(port.x, mainPt.y, port.z);
    const out: any[] = [];
    if (mainPt.distanceTo(elbow) > 10) {
      out.push(this.makePipe(mainPt, elbow, main, role, connectionId, deviceId, out.length, nodeType));
    }
    if (elbow.distanceTo(port) > 10) {
      out.push(this.makePipe(elbow, port, main, role, connectionId, deviceId, out.length, nodeType));
    }
    return out;
  }

  /**
   * Подключает 2-портовый прибор (радиатор/кондиционер/вентустановку) нижним типовым узлом
   * к выбранной двухтрубной магистрали. Мутирует elements: убирает старые подводки прибора,
   * режет обе трубы пары и добавляет подводки. Одна логика на все 2-портовые приборы.
   */
  static connectDeviceToPipePair(elements: any[], device: any, pickedPipe: any): RadiatorConnectionResult {
    const ports = this.devicePorts(device);
    if (!ports) return { ok: false, error: `У «${device?.type ?? "?"}» нет портов подключения.` };

    const mains = this.chooseMains(elements, device, pickedPipe);
    if (!mains) {
      return { ok: false, error: "Выберите трубу двухтрубной магистрали." };
    }

    const nodeType = `${device.type}_lower`;
    const connectionId = `conn-${nodeType}-${device.id}-${Date.now()}`;
    const supplySplit = this.splitPipeAt(mains.supplyPipe, ports.supply);
    const returnSplit = this.splitPipeAt(mains.returnPipe, ports.return);

    for (let i = elements.length - 1; i >= 0; i--) {
      const elem = elements[i];
      if (
        elem.deviceId === device.id ||
        elem.id === mains.supplyPipe.id ||
        elem.id === mains.returnPipe.id
      ) {
        elements.splice(i, 1);
      }
    }

    elements.push(...supplySplit.replacement, ...returnSplit.replacement);
    elements.push(...this.buildRoute(supplySplit.point, ports.supply, mains.supplyPipe, "supply", connectionId, device.id, nodeType));
    elements.push(...this.buildRoute(returnSplit.point, ports.return, mains.returnPipe, "return", connectionId, device.id, nodeType));

    device.connectionId = connectionId;
    device.connectionNodeType = nodeType;
    return { ok: true, connectionId };
  }

  // Совместимость с прежним именем (вызовы в коде, отопление).
  static connectRadiatorLower(elements: any[], rad: any, pickedPipe: any): RadiatorConnectionResult {
    return this.connectDeviceToPipePair(elements, rad, pickedPipe);
  }

  /**
   * Диффузор/решётка → указанный воздуховод: гибкая подводка (флекс) ≤ 500 мм + врезка.
   * Режет воздуховод в точке врезки (T-узел для FittingGenerator) и тянет короткий
   * круглый флекс от точки врезки к прибору.
   */
  static connectTerminalToDuct(elements: any[], terminal: any, pickedDuct: any): RadiatorConnectionResult {
    if (pickedDuct?.type !== "duct" || !pickedDuct.start || !pickedDuct.end) {
      return { ok: false, error: "Выберите воздуховод." };
    }
    if (!terminal?.position) return { ok: false, error: "У прибора нет позиции." };

    const port = new THREE.Vector3(terminal.position[0], terminal.position[1], terminal.position[2]);


    const connectionId = `conn-flex-${terminal.id}-${Date.now()}`;
    const split = this.splitPipeAt(pickedDuct, port);

    for (let i = elements.length - 1; i >= 0; i--) {
      const e = elements[i];
      const isOldTerminalBranch =
        e.deviceId === terminal.id ||
        (terminal.connectionId && e.connectionId === terminal.connectionId) ||
        (typeof e.id === "string" &&
          (e.id.startsWith(`duct-branch-${terminal.id}-`) || e.id.startsWith(`flex-${terminal.id}-`)));
      if (isOldTerminalBranch || e.id === pickedDuct.id) {
        elements.splice(i, 1);
      }
    }
    elements.push(...split.replacement);

    const flexD = terminal.size?.d || 160;
    
    // Orthogonal route: split.point -> elbow -> port
    const elbow = new THREE.Vector3(port.x, split.point.y, port.z);
    const L1 = split.point.distanceTo(elbow);
    const L2 = elbow.distanceTo(port);
    const totalLength = L1 + L2;

    const flexLength = Math.min(totalLength, 500); // Max 500 mm flex
    const flexStart = new THREE.Vector3();

    if (flexLength >= L2) {
      // Flex covers the entire vertical segment and part of the horizontal segment
      const flexOnHorizontal = flexLength - L2;
      const horizDir = new THREE.Vector3().subVectors(split.point, elbow).normalize();
      flexStart.copy(elbow).addScaledVector(horizDir, flexOnHorizontal);
      
      // Rigid part: split.point -> flexStart (horizontal)
      if (split.point.distanceTo(flexStart) > 1) {
        elements.push({
          id: `duct-branch-${terminal.id}-${Date.now()}-rigid`,
          type: "duct",
          shape: "round",
          size: { d: flexD },
          start: [Math.round(split.point.x), Math.round(split.point.y), Math.round(split.point.z)],
          end: [Math.round(flexStart.x), Math.round(flexStart.y), Math.round(flexStart.z)],
          system: pickedDuct.system || terminal.system || "Приточный",
          material: pickedDuct.material || "steel_galv",
          deviceId: terminal.id,
          connectionId,
          connectionNodeType: "diffuser_flex",
        });
      }

      // Flex part 1: elbow -> flexStart (horizontal)
      if (elbow.distanceTo(flexStart) > 1) {
        elements.push({
          id: `flex-${terminal.id}-${Date.now()}-1`,
          type: "duct",
          shape: "round",
          kind: "flex",
          size: { d: flexD },
          start: [Math.round(flexStart.x), Math.round(flexStart.y), Math.round(flexStart.z)],
          end: [Math.round(elbow.x), Math.round(elbow.y), Math.round(elbow.z)],
          system: pickedDuct.system || terminal.system || "Приточный",
          material: pickedDuct.material || "steel_galv",
          deviceId: terminal.id,
          connectionId,
          connectionNodeType: "diffuser_flex",
          isFlex: true,
        });
      }

      // Flex part 2: port -> elbow (vertical)
      if (port.distanceTo(elbow) > 1) {
        elements.push({
          id: `flex-${terminal.id}-${Date.now()}-2`,
          type: "duct",
          shape: "round",
          kind: "flex",
          size: { d: flexD },
          start: [Math.round(elbow.x), Math.round(elbow.y), Math.round(elbow.z)],
          end: [Math.round(port.x), Math.round(port.y), Math.round(port.z)],
          system: pickedDuct.system || terminal.system || "Приточный",
          material: pickedDuct.material || "steel_galv",
          deviceId: terminal.id,
          connectionId,
          connectionNodeType: "diffuser_flex",
          isFlex: true,
        });
      }
    } else {
      // Flex only covers the lower part of the vertical segment
      const vertDir = new THREE.Vector3().subVectors(elbow, port).normalize();
      flexStart.copy(port).addScaledVector(vertDir, flexLength);

      // Rigid segment 1 (horizontal): split.point -> elbow
      if (split.point.distanceTo(elbow) > 1) {
        elements.push({
          id: `duct-branch-${terminal.id}-${Date.now()}-rigid-1`,
          type: "duct",
          shape: "round",
          size: { d: flexD },
          start: [Math.round(split.point.x), Math.round(split.point.y), Math.round(split.point.z)],
          end: [Math.round(elbow.x), Math.round(elbow.y), Math.round(elbow.z)],
          system: pickedDuct.system || terminal.system || "Приточный",
          material: pickedDuct.material || "steel_galv",
          deviceId: terminal.id,
          connectionId,
          connectionNodeType: "diffuser_flex",
        });
      }

      // Rigid segment 2 (vertical): elbow -> flexStart
      if (elbow.distanceTo(flexStart) > 1) {
        elements.push({
          id: `duct-branch-${terminal.id}-${Date.now()}-rigid-2`,
          type: "duct",
          shape: "round",
          size: { d: flexD },
          start: [Math.round(elbow.x), Math.round(elbow.y), Math.round(elbow.z)],
          end: [Math.round(flexStart.x), Math.round(flexStart.y), Math.round(flexStart.z)],
          system: pickedDuct.system || terminal.system || "Приточный",
          material: pickedDuct.material || "steel_galv",
          deviceId: terminal.id,
          connectionId,
          connectionNodeType: "diffuser_flex",
        });
      }

      // Flex: port -> flexStart (vertical)
      if (port.distanceTo(flexStart) > 1) {
        elements.push({
          id: `flex-${terminal.id}-${Date.now()}-3`,
          type: "duct",
          shape: "round",
          kind: "flex",
          size: { d: flexD },
          start: [Math.round(flexStart.x), Math.round(flexStart.y), Math.round(flexStart.z)],
          end: [Math.round(port.x), Math.round(port.y), Math.round(port.z)],
          system: pickedDuct.system || terminal.system || "Приточный",
          material: pickedDuct.material || "steel_galv",
          deviceId: terminal.id,
          connectionId,
          connectionNodeType: "diffuser_flex",
          isFlex: true,
        });
      }
    }

    terminal.connectionId = connectionId;
    terminal.connectionNodeType = "diffuser_flex";
    terminal.host = split.replacement[0]?.id || pickedDuct.id;
    return { ok: true, connectionId };
  }

  // ——— Электрика: кабель ПО ЛОТКАМ (FR-ELEC-1) ———

  // Ключ узла графа лотков: координата, округлённая до сетки (мм).
  private static nodeKey(p: THREE.Vector3, grid = 10): string {
    const r = (v: number) => Math.round(v / grid) * grid;
    return `${r(p.x)},${r(p.y)},${r(p.z)}`;
  }

  /**
   * Строит граф лотков: узлы = концы лотков (со сваркой совпадающих концов по сетке),
   * рёбра = сами лотки. Возвращает adjacency + позиции узлов + список лотков для проекций.
   */
  private static buildTrayGraph(trays: any[]) {
    const adj = new Map<string, Array<{ to: string; w: number }>>();
    const pos = new Map<string, THREE.Vector3>();
    const addNode = (p: THREE.Vector3) => {
      const k = this.nodeKey(p);
      if (!pos.has(k)) {
        pos.set(k, p.clone());
        adj.set(k, []);
      }
      return k;
    };
    const addEdge = (a: string, b: string, w: number) => {
      if (a === b) return;
      adj.get(a)!.push({ to: b, w });
      adj.get(b)!.push({ to: a, w });
    };
    for (const t of trays) {
      const a = new THREE.Vector3(t.start[0], t.start[1], t.start[2]);
      const b = new THREE.Vector3(t.end[0], t.end[1], t.end[2]);
      addEdge(addNode(a), addNode(b), a.distanceTo(b));
    }
    return { adj, pos };
  }

  // Кратчайший путь (Дейкстра) между узлами графа лотков → массив ключей или null.
  private static dijkstra(
    adj: Map<string, Array<{ to: string; w: number }>>,
    from: string,
    to: string,
  ): string[] | null {
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const visited = new Set<string>();
    dist.set(from, 0);
    while (true) {
      let u: string | null = null;
      let best = Infinity;
      for (const [k, d] of dist) {
        if (!visited.has(k) && d < best) {
          best = d;
          u = k;
        }
      }
      if (u === null) break;
      if (u === to) break;
      visited.add(u);
      for (const e of adj.get(u) || []) {
        if (visited.has(e.to)) continue;
        const nd = best + e.w;
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd);
          prev.set(e.to, u);
        }
      }
    }
    if (!dist.has(to)) return null;
    const path: string[] = [];
    let cur: string | undefined = to;
    while (cur !== undefined) {
      path.unshift(cur);
      cur = prev.get(cur);
    }
    return path[0] === from ? path : null;
  }

  /**
   * Розетка → щит: кабель идёт ПО ЛОТКАМ, а не напрямую (FR-ELEC-1).
   * Проекция розетки и щита на ближайшие лотки → кратчайший путь по графу лотков →
   * кабель-полилиния socket → вход → [лотки] → выход → щит. Нет лотков → fallback прямой кабель.
   */
  static connectSocketToPanel(elements: any[], socket: any, panel: any): RadiatorConnectionResult {
    if (!socket?.position) return { ok: false, error: "У розетки нет позиции." };
    if (!panel?.position || (panel.type !== "panel" && panel.type !== "switchboard")) {
      return { ok: false, error: "Выберите щит/шкаф для подключения." };
    }
    const socketPt = new THREE.Vector3(socket.position[0], socket.position[1], socket.position[2]);
    const panelPt = new THREE.Vector3(panel.position[0], panel.position[1], panel.position[2]);

    const connectionId = `conn-cable-${socket.id}-${Date.now()}`;
    const system = panel.system || socket.system || "СКС";
    const pushCable = (points: THREE.Vector3[]) => {
      for (let i = elements.length - 1; i >= 0; i--) {
        if (elements[i].deviceId === socket.id && elements[i].type === "cable") elements.splice(i, 1);
      }
      elements.push({
        id: `cable-${socket.id}-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
        type: "cable",
        points: points.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.z)]),
        system,
        material: socket.cable || "ВВГнг-LS 3x2.5",
        deviceId: socket.id,
        panelId: panel.id,
        connectionId,
        connectionNodeType: "cable_tray",
      });
      socket.connectionId = connectionId;
      socket.connectionNodeType = "cable_tray";
    };

    const trays = elements.filter((e) => e.type === "tray" && e.start && e.end);
    // Нет лотков рядом — прямой кабель (fallback по ТЗ).
    const nearTray = (p: THREE.Vector3) =>
      trays
        .map((t) => ({ t, d: this.distanceToPipe(t, p) }))
        .sort((a, b) => a.d - b.d)[0];
    const entry = nearTray(socketPt);
    const exit = nearTray(panelPt);
    if (!entry || !exit) {
      pushCable([socketPt, panelPt]);
      return { ok: true, connectionId, error: "Лотков нет — кабель проложен напрямую." };
    }

    const entryProj = this.nearestOnSeg(socketPt, this.pipeSegment(entry.t).a, this.pipeSegment(entry.t).b);
    const exitProj = this.nearestOnSeg(panelPt, this.pipeSegment(exit.t).a, this.pipeSegment(exit.t).b);

    const { adj, pos } = this.buildTrayGraph(trays);
    // Виртуальные узлы входа/выхода, привязанные к концам своих лотков (и напрямую, если лоток общий).
    const ENTRY = "__entry__";
    const EXIT = "__exit__";
    pos.set(ENTRY, entryProj);
    pos.set(EXIT, exitProj);
    adj.set(ENTRY, []);
    adj.set(EXIT, []);
    const link = (virt: string, vp: THREE.Vector3, tray: any) => {
      for (const end of [this.pipeSegment(tray).a, this.pipeSegment(tray).b]) {
        const k = this.nodeKey(end);
        if (adj.has(k)) {
          const w = vp.distanceTo(end);
          adj.get(virt)!.push({ to: k, w });
          adj.get(k)!.push({ to: virt, w });
        }
      }
    };
    link(ENTRY, entryProj, entry.t);
    link(EXIT, exitProj, exit.t);
    if (entry.t.id === exit.t.id) {
      const w = entryProj.distanceTo(exitProj);
      adj.get(ENTRY)!.push({ to: EXIT, w });
      adj.get(EXIT)!.push({ to: ENTRY, w });
    }

    const path = this.dijkstra(adj, ENTRY, EXIT);
    if (!path) {
      pushCable([socketPt, panelPt]);
      return { ok: true, connectionId, error: "Лотки не связаны — кабель проложен напрямую." };
    }
    const points = [socketPt, ...path.map((k) => pos.get(k)!), panelPt];
    pushCable(points);
    return { ok: true, connectionId };
  }

  static connectVrvSystem(elements: any[], vrvOutdoor: any, acUnit: any): RadiatorConnectionResult {
    const vrvPorts = this.devicePorts(vrvOutdoor);
    if (!vrvPorts) return { ok: false, error: "У наружного блока VRV нет портов подключения." };

    const TOLERANCE = 500; // мм
    const isClose = (p: number[], port: THREE.Vector3) => {
      const pt = new THREE.Vector3(p[0], p[1], p[2]);
      return pt.distanceTo(port) < TOLERANCE;
    };

    const vrvPipes = elements.filter(
      (e) =>
        e.type === "pipe" &&
        !e.deviceId &&
        e.pairId &&
        (isClose(e.start, vrvPorts.supply) ||
          isClose(e.end, vrvPorts.supply) ||
          isClose(e.start, vrvPorts.return) ||
          isClose(e.end, vrvPorts.return))
    );

    if (vrvPipes.length === 0) {
      return {
        ok: false,
        error: "Не найдена фреоновая магистраль, подключенная к наружному блоку VRV. Сначала проложите трубы от портов наружного блока.",
      };
    }

    const mainPipe = vrvPipes[0];
    return this.connectDeviceToPipePair(elements, acUnit, mainPipe);
  }

  /**
   * Единая точка подключения прибора к указанной цели (FR-CONNECT, «единая логика узлов»).
   * Диспетчер по типу прибора — новый типовой узел = один case, без правок вызывающего кода.
   */
  static connect(elements: any[], device: any, target: any): RadiatorConnectionResult {
    switch (device?.type) {
      // Отопление и кондиционирование: 2 порта прибора → пара труб (один узел на всех).
      case "radiator":
      case "ac":
      case "ac_ceiling":
      case "equipment":
        return this.connectDeviceToPipePair(elements, device, target);
      case "vrv_outdoor":
        return this.connectVrvSystem(elements, device, target);
      case "terminal":
        return this.connectTerminalToDuct(elements, device, target);
      // Электрика: розетка → щит, кабель по лоткам.
      case "socket":
        return this.connectSocketToPanel(elements, device, target);
      default:
        return {
          ok: false,
          error: `Подключение для «${device?.type ?? "?"}» пока не реализовано.`,
        };
    }
  }
}
