import * as THREE from "three";

/**
 * SystemManager — авто-формирование инженерных СИСТЕМ по связности (FR-SYS-1).
 *
 * Правила (согласованы с заказчиком):
 *  1. Нумерация ПО ТИПУ: отопление ОВ1, ОВ2…; холод ХС1…; приток П1…; вытяжка В1…
 *  2. Принадлежность ПО СВЯЗНОСТИ: элементы, физически соединённые (общие координаты
 *     концов/портов/узлов или host), попадают в один связный компонент.
 *  3. Система существует ТОЛЬКО если в компоненте есть И трасса (труба/воздуховод/лоток),
 *     И прибор (радиатор/кондиционер/решётка/оборудование). Идеал — ещё системное
 *     оборудование (котёл/машина), но это не обязательное условие.
 *
 * Результат: проставляет `systemId` у элементов и возвращает реестр систем.
 */

export interface SystemInfo {
  id: string; // "ОВ1"
  name: string; // редактируемое имя (по умолчанию = id)
  type: "heating" | "conditioning" | "ventilation" | "electrical" | "other";
  prefix: string; // ОВ (отопление/вентиляция/кондиционирование) / ЭО / ВК …
  elementIds: string[];
  volume: number; // м³ (трубы πr²L + номинал приборов)
  flow: number | null; // заглушка под гидравлику
}

const ROUTE_TYPES = new Set(["pipe", "duct", "tray"]);
const DEVICE_TYPES = new Set(["radiator", "ac", "ac_ceiling", "equipment", "terminal", "vrv_outdoor"]);
// Локальные координаты портов приборов (мм) — в синхроне с TwoPipeDrawingTool.getEquipmentPorts
const PORT_LOCALS: Record<string, { supply: number[]; return: number[] }> = {
  equipment: { supply: [600, 0, 0], return: [-600, 0, 0] },
  radiator: { supply: [50, -250, 310], return: [50, -250, 360] },
  ac: { supply: [110, -100, 150], return: [110, -100, 200] },
  ac_ceiling: { supply: [370, 150, -50], return: [370, 150, 50] },
  vrv_outdoor: { supply: [-400, 200, 200], return: [-400, 200, -200] },
};
// Номинальный объём приборов, м³ (заглушка — «номинал»)
const DEVICE_NOMINAL_VOLUME: Record<string, number> = {
  radiator: 0.008,
  ac: 0.02,
  ac_ceiling: 0.02,
  equipment: 0.2,
  terminal: 0.001,
  vrv_outdoor: 0.1,
};

export class SystemManager {
  private static key(x: number, y: number, z: number): string {
    const r = (v: number) => Math.round(v / 10) * 10; // округление до 10 мм
    return `${r(x)},${r(y)},${r(z)}`;
  }

  // Точки подключения прибора в МИРОВЫХ мм (повторяет логику getEquipmentPorts)
  private static devicePoints(elem: any): number[][] {
    const locals = PORT_LOCALS[elem.type];
    const pos = elem.position || [0, 0, 0];
    if (!locals) return [pos];
    const q = new THREE.Quaternion();
    if (elem.rotation !== undefined) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (elem.rotation * Math.PI) / 180);
    } else if (elem.normal) {
      q.setFromUnitVectors(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(elem.normal[0], elem.normal[1], elem.normal[2]),
      );
    }
    const toWorld = (l: number[]) =>
      new THREE.Vector3(l[0], l[1], l[2])
        .applyQuaternion(q)
        .add(new THREE.Vector3(pos[0], pos[1], pos[2]));
    const s = toWorld(locals.supply);
    const r = toWorld(locals.return);
    return [
      [s.x, s.y, s.z],
      [r.x, r.y, r.z],
      pos,
    ];
  }

  // Координаты «стыковки» элемента (по которым строится связность)
  private static elemPoints(elem: any): number[][] {
    if (ROUTE_TYPES.has(elem.type) && elem.start && elem.end) {
      return [elem.start, elem.end];
    }
    if (DEVICE_TYPES.has(elem.type)) {
      if (elem.position) return this.devicePoints(elem);
      return [];
    }
    if (elem.type === "fitting" && elem.node) return [elem.node];
    return [];
  }

  static rebuild(elements: any[]): SystemInfo[] {
    // union-find
    const parent: Record<string, string> = {};
    const find = (a: string): string => {
      while (parent[a] && parent[a] !== a) {
        parent[a] = parent[parent[a]] || parent[a];
        a = parent[a];
      }
      return a;
    };
    const union = (a: string, b: string) => {
      if (!a || !b) return;
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    const considered = elements.filter(
      (e) =>
        ROUTE_TYPES.has(e.type) ||
        DEVICE_TYPES.has(e.type) ||
        e.type === "fitting" ||
        e.type === "duct_accessory" ||
        e.type === "pipe_accessory",
    );
    for (const e of considered) parent[e.id] = e.id;

    // связность по общим координатам
    const coordMap: Record<string, string[]> = {};
    for (const e of considered) {
      for (const p of this.elemPoints(e)) {
        const k = this.key(p[0], p[1], p[2]);
        (coordMap[k] = coordMap[k] || []).push(e.id);
      }
    }
    for (const k in coordMap) {
      const ids = coordMap[k];
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    }
    // явные связи: фитинг.connects, host у арматуры/решёток
    for (const e of considered) {
      if (e.type === "fitting" && Array.isArray(e.connects)) {
        for (const id of e.connects) union(e.id, id);
      }
      if ((e.type === "duct_accessory" || e.type === "pipe_accessory") && e.host) {
        union(e.id, e.host);
      }
      // решётка/диффузор сидит на поверхности короба — связываем с хостом явно
      if (e.type === "terminal" && e.host) {
        union(e.id, e.host);
      }
    }

    // группируем по корню
    const comps: Record<string, any[]> = {};
    for (const e of considered) {
      const root = find(e.id);
      (comps[root] = comps[root] || []).push(e);
    }

    // отбираем компоненты «трасса + прибор», сортируем стабильно
    const qualified = Object.values(comps)
      .filter(
        (members) =>
          members.some((m) => ROUTE_TYPES.has(m.type)) &&
          members.some((m) => DEVICE_TYPES.has(m.type)),
      )
      .sort((a, b) => {
        const ka = a.map((m) => m.id).sort()[0] || "";
        const kb = b.map((m) => m.id).sort()[0] || "";
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });

    // сбрасываем systemId у всех (попавшие в систему — перезапишем)
    for (const e of elements) e.systemId = undefined;

    const counters: Record<string, number> = {};
    const customNames: Record<string, string> = (window as any).__systemCustomNames || {};
    const systems: SystemInfo[] = [];

    for (const members of qualified) {
      const { type, prefix } = this.detectType(members);
      counters[prefix] = (counters[prefix] || 0) + 1;
      const id = `${prefix}${counters[prefix]}`;
      const name = customNames[id] || id;

      let volume = 0;
      for (const m of members) {
        m.systemId = id;
        volume += this.elemVolume(m);
      }

      systems.push({
        id,
        name,
        type,
        prefix,
        elementIds: members.map((m) => m.id),
        volume,
        flow: null,
      });
    }

    return systems;
  }

  private static detectType(members: any[]): { type: SystemInfo["type"]; prefix: string } {
    const hasDuct = members.some((m) => m.type === "duct");
    const hasPipe = members.some((m) => m.type === "pipe");
    const hasTray = members.some((m) => m.type === "tray");

    // Отопление, вентиляция и кондиционирование — единый раздел «ОВ» со сквозной нумерацией.
    if (hasPipe) {
      const hasAC = members.some((m) => m.type === "ac" || m.type === "ac_ceiling");
      const cooling =
        hasAC ||
        members.some(
          (m) => m.type === "pipe" && typeof m.system === "string" && /холод/i.test(m.system),
        );
      return cooling
        ? { type: "conditioning", prefix: "ОВ" }
        : { type: "heating", prefix: "ОВ" };
    }
    if (hasDuct) return { type: "ventilation", prefix: "ОВ" };
    if (hasTray) return { type: "electrical", prefix: "ЭО" };
    return { type: "other", prefix: "С" };
  }

  private static elemVolume(elem: any): number {
    if (elem.type === "pipe" && elem.start && elem.end) {
      const r = ((elem.size?.d || 25) / 2) / 1000; // м
      const len = this.len(elem) / 1000;
      return Math.PI * r * r * len;
    }
    if (elem.type === "duct" && elem.start && elem.end) {
      const len = this.len(elem) / 1000;
      if (elem.shape === "round") {
        const r = (elem.size?.d || 200) / 2 / 1000;
        return Math.PI * r * r * len;
      }
      const w = (elem.size?.w || 300) / 1000;
      const h = (elem.size?.h || 200) / 1000;
      return w * h * len;
    }
    if (DEVICE_TYPES.has(elem.type)) {
      return DEVICE_NOMINAL_VOLUME[elem.type] || 0;
    }
    return 0;
  }

  private static len(elem: any): number {
    const dx = elem.end[0] - elem.start[0];
    const dy = elem.end[1] - elem.start[1];
    const dz = elem.end[2] - elem.start[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
