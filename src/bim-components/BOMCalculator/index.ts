export interface BOMDuctGroup {
  name: string;
  shape: "round" | "rectangular";
  sizeLabel: string;
  length: number;      // в метрах
  surfaceArea: number; // в кв. метрах
  weight: number;      // в кг
  sortamentRef: string;
}

export interface BOMFittingGroup {
  name: string;
  kind: "bend" | "tee" | "reducer";
  sizeLabel: string;
  quantity: number;    // в шт
  sortamentRef: string;
}

export interface BOMTerminalGroup {
  name: string;
  kind: "grille" | "diffuser";
  model: string;
  quantity: number;
}

export interface BOMEquipmentGroup {
  name: string;
  model: string;
  sizeLabel: string;
  quantity: number;
}

export interface BOMWallGroup {
  name: string;
  height: number;      // в мм
  thickness: number;   // в мм
  material: string;
  length: number;      // в метрах
  surfaceArea: number; // в кв. метрах (2 * H * L)
  volume: number;      // в куб. метрах (W * H * L)
}

export interface BOMTrayGroup {
  name: string;
  width: number;       // в мм
  height: number;      // в мм
  kind: "solid" | "perforated" | "ladder";
  length: number;      // в метрах
  sortamentRef: string;
}

export interface BOMPipeGroup {
  name: string;
  d: number;           // диаметр в мм
  material: "steel_water" | "ppr";
  length: number;      // в метрах
  weight: number;      // в кг
  sortamentRef: string;
}

export interface BOMSocketGroup {
  name: string;
  model: string;
  quantity: number;
}

export interface BOMPanelGroup {
  name: string;
  model: string;
  quantity: number;
}

export interface BOMLightGroup {
  name: string;
  model: string;
  quantity: number;
}

export interface BOMDoorGroup {
  name: string;
  model: string;
  quantity: number;
}

export interface BOMWindowGroup {
  name: string;
  model: string;
  quantity: number;
}

export interface BOMACGroup {
  name: string;
  model: string;
  quantity: number;
}

export interface BOMRadiatorGroup {
  name: string;
  model: string;
  quantity: number;
}

export interface BOMDuctAccessoryGroup {
  name: string;
  kind: "throttle" | "silencer" | "fire_damper";
  sizeLabel: string;
  quantity: number;
}

export interface BOMPipeAccessoryGroup {
  name: string;
  kind: "ball_valve" | "balancing" | "filter";
  sizeLabel: string;
  quantity: number;
}

export interface BOMResult {
  ducts: BOMDuctGroup[];
  fittings: BOMFittingGroup[];
  terminals: BOMTerminalGroup[];
  equipment: BOMEquipmentGroup[];
  walls: BOMWallGroup[];
  trays: BOMTrayGroup[];
  pipes: BOMPipeGroup[];
  sockets: BOMSocketGroup[];
  panels: BOMPanelGroup[];
  lights: BOMLightGroup[];
  doors: BOMDoorGroup[];
  windows: BOMWindowGroup[];
  acs: BOMACGroup[];
  radiators: BOMRadiatorGroup[];
  ductAccessories: BOMDuctAccessoryGroup[];
  pipeAccessories: BOMPipeAccessoryGroup[];
}

export class BOMCalculator {
  // Вес погонного метра (кг/м) по сортаменту ВСН 353-86
  private static ductMassMap: Record<string, number> = {
    "VSN353-R-100": 1.2,
    "VSN353-R-125": 1.5,
    "VSN353-R-160": 1.9,
    "VSN353-R-200": 2.4,
    "VSN353-R-250": 3.1,
    "VSN353-R-315": 3.9,
    "VSN353-R-400": 4.9,
    "VSN353-REC-150x100": 2.0,
    "VSN353-REC-200x150": 2.8,
    "VSN353-REC-250x200": 3.5,
    "VSN353-REC-400x250": 6.1,
  };

  static calculate(elements: any[]): BOMResult {
    const ductsMap = new Map<string, BOMDuctGroup>();
    const fittingsMap = new Map<string, BOMFittingGroup>();
    const terminalsMap = new Map<string, BOMTerminalGroup>();
    const equipmentMap = new Map<string, BOMEquipmentGroup>();
    const wallsMap = new Map<string, BOMWallGroup>();
    const traysMap = new Map<string, BOMTrayGroup>();
    const pipesMap = new Map<string, BOMPipeGroup>();
    const socketsMap = new Map<string, BOMSocketGroup>();
    const panelsMap = new Map<string, BOMPanelGroup>();
    const lightsMap = new Map<string, BOMLightGroup>();
    const doorsMap = new Map<string, BOMDoorGroup>();
    const windowsMap = new Map<string, BOMWindowGroup>();
    const acsMap = new Map<string, BOMACGroup>();
    const radiatorsMap = new Map<string, BOMRadiatorGroup>();
    const ductAccessoriesMap = new Map<string, BOMDuctAccessoryGroup>();
    const pipeAccessoriesMap = new Map<string, BOMPipeAccessoryGroup>();

    for (const elem of elements) {
      if (elem.type === "duct") {
        const dx = elem.end[0] - elem.start[0];
        const dy = elem.end[1] - elem.start[1];
        const dz = elem.end[2] - elem.start[2];
        const lengthM = Math.sqrt(dx * dx + dy * dy + dz * dz) / 1000;

        let sizeLabel = "";
        let area = 0;
        if (elem.shape === "round") {
          sizeLabel = `⌀${elem.size.d}`;
          area = Math.PI * (elem.size.d / 1000) * lengthM;
        } else {
          sizeLabel = `${elem.size.w}x${elem.size.h}`;
          area = 2 * ((elem.size.w + elem.size.h) / 1000) * lengthM;
        }

        const ref = elem.sortamentRef || "unknown";
        const massPerM = this.ductMassMap[ref] || (elem.shape === "round" ? (elem.size.d / 100) * 1.2 : ((elem.size.w + elem.size.h) / 200) * 2.0);
        const weight = massPerM * lengthM;

        const key = `${elem.shape}-${sizeLabel}-${ref}`;
        if (ductsMap.has(key)) {
          const group = ductsMap.get(key)!;
          group.length += lengthM;
          group.surfaceArea += area;
          group.weight += weight;
        } else {
          ductsMap.set(key, {
            name: elem.shape === "round" ? "Воздуховод круглый" : "Воздуховод прямоугольный",
            shape: elem.shape,
            sizeLabel,
            length: lengthM,
            surfaceArea: area,
            weight,
            sortamentRef: ref,
          });
        }
      }
      else if (elem.type === "wall") {
        const dx = elem.end[0] - elem.start[0];
        const dy = elem.end[1] - elem.start[1];
        const dz = elem.end[2] - elem.start[2];
        const lengthM = Math.sqrt(dx * dx + dy * dy + dz * dz) / 1000;

        const heightM = elem.height / 1000;
        const thicknessM = elem.thickness / 1000;

        const area = 2 * heightM * lengthM;
        const volume = thicknessM * heightM * lengthM;

        let matLabel = elem.material;
        if (elem.material === "brick") matLabel = "Кирпич";
        else if (elem.material === "concrete") matLabel = "Бетон";
        else if (elem.material === "gypsum") matLabel = "Гипсокартон";

        const name = `Стена (${matLabel})`;

        const key = `${elem.height}-${elem.thickness}-${elem.material}`;
        if (wallsMap.has(key)) {
          const group = wallsMap.get(key)!;
          group.length += lengthM;
          group.surfaceArea += area;
          group.volume += volume;
        } else {
          wallsMap.set(key, {
            name,
            height: elem.height,
            thickness: elem.thickness,
            material: elem.material,
            length: lengthM,
            surfaceArea: area,
            volume,
          });
        }
      }
      else if (elem.type === "tray") {
        const dx = elem.end[0] - elem.start[0];
        const dy = elem.end[1] - elem.start[1];
        const dz = elem.end[2] - elem.start[2];
        const lengthM = Math.sqrt(dx * dx + dy * dy + dz * dz) / 1000;

        let kindLabel = elem.kind;
        if (elem.kind === "solid") kindLabel = "Сплошной";
        else if (elem.kind === "perforated") kindLabel = "Перфорированный";
        else if (elem.kind === "ladder") kindLabel = "Лестничный";
        
        const name = `Лоток кабельный (${kindLabel})`;
        const key = `${elem.width}-${elem.height}-${elem.kind}`;
        
        if (traysMap.has(key)) {
          traysMap.get(key)!.length += lengthM;
        } else {
          traysMap.set(key, {
            name,
            width: elem.width,
            height: elem.height,
            kind: elem.kind,
            length: lengthM,
            sortamentRef: elem.sortamentRef || "unknown"
          });
        }
      }
      else if (elem.type === "pipe") {
        const dx = elem.end[0] - elem.start[0];
        const dy = elem.end[1] - elem.start[1];
        const dz = elem.end[2] - elem.start[2];
        const lengthM = Math.sqrt(dx * dx + dy * dy + dz * dz) / 1000;

        let matLabel = elem.material;
        let massPerM = 1.0;
        if (elem.material === "steel_water") {
          matLabel = "Сталь ВГП";
          const d = elem.size.d;
          if (d <= 15) massPerM = 1.28;
          else if (d <= 20) massPerM = 1.66;
          else if (d <= 25) massPerM = 2.39;
          else if (d <= 32) massPerM = 3.09;
          else if (d <= 40) massPerM = 3.84;
          else if (d <= 50) massPerM = 4.88;
          else if (d <= 80) massPerM = 8.4;
          else if (d <= 100) massPerM = 11.6;
          else massPerM = (d / 10) * 1.1;
        } else if (elem.material === "ppr") {
          matLabel = "Полипропилен";
          massPerM = (elem.size.d / 100) * 0.4;
        }
        
        const weight = massPerM * lengthM;
        const name = `Трубопровод (${matLabel})`;
        const key = `${elem.size.d}-${elem.material}`;
        
        if (pipesMap.has(key)) {
          const group = pipesMap.get(key)!;
          group.length += lengthM;
          group.weight += weight;
        } else {
          pipesMap.set(key, {
            name,
            d: elem.size.d,
            material: elem.material,
            length: lengthM,
            weight,
            sortamentRef: elem.sortamentRef || "unknown"
          });
        }
      }
      else if (elem.type === "fitting") {
        let sizeLabel = "";
        if (elem.size) {
          if (elem.size.d) {
            sizeLabel = `⌀${elem.size.d}`;
          } else if (elem.size.w) {
            sizeLabel = `${elem.size.w}x${elem.size.h}`;
          }
        }
        
        const systemType = elem.systemType || "duct";
        const prefix = systemType === "pipe" ? "Трубный " : systemType === "tray" ? "Лоточный " : "";
        
        let name = "";
        if (elem.kind === "bend") {
          name = `${prefix}отвод ${elem.angle || 90}°`;
        } else if (elem.kind === "tee") {
          name = `${prefix}тройник`;
        } else if (elem.kind === "reducer") {
          name = `${prefix}переход`;
        }

        const ref = elem.sortamentRef || "unknown";
        const key = `${elem.kind}-${sizeLabel}-${ref}`;

        if (fittingsMap.has(key)) {
          fittingsMap.get(key)!.quantity += 1;
        } else {
          fittingsMap.set(key, {
            name,
            kind: elem.kind,
            sizeLabel,
            quantity: 1,
            sortamentRef: ref,
          });
        }
      }
      else if (elem.type === "terminal") {
        const key = `${elem.kind}-${elem.model}`;
        if (terminalsMap.has(key)) {
          terminalsMap.get(key)!.quantity += 1;
        } else {
          terminalsMap.set(key, {
            name: elem.kind === "grille" ? "Решетка приточно-вытяжная" : "Диффузор круглый",
            kind: elem.kind,
            model: elem.model,
            quantity: 1,
          });
        }
      }
      else if (elem.type === "equipment") {
        const sizeLabel = `${elem.size.l}x${elem.size.w}x${elem.size.h}`;
        const key = `${elem.kind}-${elem.model}-${sizeLabel}`;
        if (equipmentMap.has(key)) {
          equipmentMap.get(key)!.quantity += 1;
        } else {
          equipmentMap.set(key, {
            name: "Приточно-вытяжная установка",
            model: elem.model,
            sizeLabel,
            quantity: 1,
          });
        }
      }
      else if (elem.type === "socket") {
        const key = elem.model;
        if (socketsMap.has(key)) {
          socketsMap.get(key)!.quantity += 1;
        } else {
          socketsMap.set(key, {
            name: "Розетка электрическая 220В",
            model: elem.model,
            quantity: 1,
          });
        }
      }
      else if (elem.type === "panel") {
        const key = elem.model;
        if (panelsMap.has(key)) {
          panelsMap.get(key)!.quantity += 1;
        } else {
          panelsMap.set(key, {
            name: "Щит распределительный электрический",
            model: elem.model,
            quantity: 1,
          });
        }
      }
      else if (elem.type === "light") {
        const key = elem.model;
        if (lightsMap.has(key)) {
          lightsMap.get(key)!.quantity += 1;
        } else {
          lightsMap.set(key, {
            name: "Светильник светодиодный потолочный",
            model: elem.model,
            quantity: 1,
          });
        }
      }
      else if (elem.type === "door") {
        const key = elem.model;
        if (doorsMap.has(key)) {
          doorsMap.get(key)!.quantity += 1;
        } else {
          doorsMap.set(key, {
            name: "Дверь межкомнатная",
            model: elem.model,
            quantity: 1,
          });
        }
      }
      else if (elem.type === "window") {
        const key = elem.model;
        if (windowsMap.has(key)) {
          windowsMap.get(key)!.quantity += 1;
        } else {
          windowsMap.set(key, {
            name: "Окно двухстворчатое",
            model: elem.model,
            quantity: 1,
          });
        }
      }
      else if (elem.type === "ac") {
        const key = elem.model;
        if (acsMap.has(key)) {
          acsMap.get(key)!.quantity += 1;
        } else {
          acsMap.set(key, {
            name: "Кондиционер сплит-система",
            model: elem.model,
            quantity: 1,
          });
        }
      }
      else if (elem.type === "ac_ceiling") {
        const key = elem.model;
        if (acsMap.has(key)) {
          acsMap.get(key)!.quantity += 1;
        } else {
          acsMap.set(key, {
            name: "Кондиционер потолочный кассетный",
            model: elem.model,
            quantity: 1,
          });
        }
      }
      else if (elem.type === "radiator") {
        const key = elem.model;
        if (radiatorsMap.has(key)) {
          radiatorsMap.get(key)!.quantity += 1;
        } else {
          radiatorsMap.set(key, {
            name: "Радиатор отопления",
            model: elem.model,
            quantity: 1,
          });
        }
      }
      else if (elem.type === "duct_accessory") {
        const kind = elem.kind || "throttle";
        const size = elem.size || {};
        let sizeLabel = "";
        if ("w" in size && "h" in size) {
          sizeLabel = `${size.w}x${size.h} мм`;
        } else if ("d" in size) {
          sizeLabel = `⌀${size.d} мм`;
        } else {
          sizeLabel = "универсальный";
        }
        
        const name = kind === "throttle" ? "Дроссель-клапан регулирующий" : (kind === "silencer" ? "Шумоглушитель пластинчатый" : "Клапан противопожарный");
        const key = `${kind}-${sizeLabel}`;
        if (ductAccessoriesMap.has(key)) {
          ductAccessoriesMap.get(key)!.quantity += 1;
        } else {
          ductAccessoriesMap.set(key, {
            name,
            kind,
            sizeLabel,
            quantity: 1
          });
        }
      }
      else if (elem.type === "pipe_accessory") {
        const kind = elem.kind || "ball_valve";
        const size = elem.size || {};
        const d = size.d || 25;
        const sizeLabel = `DN${d}`;
        
        const name = kind === "ball_valve" ? "Кран шаровой латунный" : (kind === "balancing" ? "Клапан балансировочный ручной" : "Фильтр сетчатый косой");
        const key = `${kind}-${sizeLabel}`;
        if (pipeAccessoriesMap.has(key)) {
          pipeAccessoriesMap.get(key)!.quantity += 1;
        } else {
          pipeAccessoriesMap.set(key, {
            name,
            kind,
            sizeLabel,
            quantity: 1
          });
        }
      }
    }

    return {
      ducts: Array.from(ductsMap.values()),
      fittings: Array.from(fittingsMap.values()),
      terminals: Array.from(terminalsMap.values()),
      equipment: Array.from(equipmentMap.values()),
      walls: Array.from(wallsMap.values()),
      trays: Array.from(traysMap.values()),
      pipes: Array.from(pipesMap.values()),
      sockets: Array.from(socketsMap.values()),
      panels: Array.from(panelsMap.values()),
      lights: Array.from(lightsMap.values()),
      doors: Array.from(doorsMap.values()),
      windows: Array.from(windowsMap.values()),
      acs: Array.from(acsMap.values()),
      radiators: Array.from(radiatorsMap.values()),
      ductAccessories: Array.from(ductAccessoriesMap.values()),
      pipeAccessories: Array.from(pipeAccessoriesMap.values()),
    };
  }
}
