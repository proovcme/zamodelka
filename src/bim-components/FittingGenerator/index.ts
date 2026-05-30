import * as THREE from "three";

export interface FittingElement {
  id: string;
  type: "fitting";
  kind: "bend" | "tee" | "reducer";
  systemType: "duct" | "tray" | "pipe"; // Тип инженерной сети
  angle?: number;
  connects: string[]; // duct, tray or pipe IDs
  node: [number, number, number]; // в мм
  sortamentRef: string;
  size?: { d?: number; w?: number; h?: number };
}

export class FittingGenerator {
  // Автогенерация фасонных частей на основе расположения элементов
  static generateFittings(elements: any[]): any[] {
    const ducts = elements.filter((elem) => elem.type === "duct");
    const trays = elements.filter((elem) => elem.type === "tray");
    const pipes = elements.filter((elem) => elem.type === "pipe");
    const walls = elements.filter((elem) => elem.type === "wall");
    const grilles = elements.filter((elem) => elem.type === "terminal");
    const equipment = elements.filter((elem) => elem.type === "equipment");
    
    // Собираем все прочие элементы (двери, окна, мебель, электрику, сантехнику и т.д.)
    const others = elements.filter((elem) => 
      elem.type !== "duct" && 
      elem.type !== "tray" && 
      elem.type !== "pipe" && 
      elem.type !== "wall" && 
      elem.type !== "terminal" && 
      elem.type !== "equipment" &&
      elem.type !== "fitting"
    );

    // Генерируем фасонные изделия отдельно для каждой системы
    const ductFittings = this.generateFittingsForType(ducts, "duct");
    const trayFittings = this.generateFittingsForType(trays, "tray");
    const pipeFittings = this.generateFittingsForType(pipes, "pipe");

    // Возвращаем объединенный массив элементов без старых фитингов
    return [
      ...ducts,
      ...trays,
      ...pipes,
      ...walls,
      ...ductFittings,
      ...trayFittings,
      ...pipeFittings,
      ...grilles,
      ...equipment,
      ...others,
    ];
  }

  private static generateFittingsForType(
    segments: any[],
    systemType: "duct" | "tray" | "pipe"
  ): FittingElement[] {
    const roundedCoord = (v: number) => Math.round(v / 10) * 10;
    const getKey = (pt: [number, number, number]) => 
      `${roundedCoord(pt[0])},${roundedCoord(pt[1])},${roundedCoord(pt[2])}`;

    const nodeGroups = new Map<
      string,
      { point: [number, number, number]; connections: { seg: any; isStart: boolean }[] }
    >();

    for (const seg of segments) {
      if (!seg.start || !seg.end) continue;

      const startKey = getKey(seg.start);
      const endKey = getKey(seg.end);

      if (!nodeGroups.has(startKey)) {
        nodeGroups.set(startKey, { point: seg.start, connections: [] });
      }
      nodeGroups.get(startKey)!.connections.push({ seg, isStart: true });

      if (!nodeGroups.has(endKey)) {
        nodeGroups.set(endKey, { point: seg.end, connections: [] });
      }
      nodeGroups.get(endKey)!.connections.push({ seg, isStart: false });
    }

    const newFittings: FittingElement[] = [];

    const getSize = (seg: any) => {
      if (systemType === "duct") {
        return seg.size;
      } else if (systemType === "tray") {
        return { w: seg.width, h: seg.height };
      } else {
        return { d: seg.size?.d || 25 };
      }
    };

    const getRef = (seg: any, prefix: string, angle?: number) => {
      const size = getSize(seg);
      if (systemType === "duct") {
        return `VSN353-${prefix}-${size.d || 200}${angle ? `-${angle}` : ""}`;
      } else if (systemType === "tray") {
        return `TRAY-${prefix}-${size.w || 200}x${size.h || 80}${angle ? `-${angle}` : ""}`;
      } else {
        return `PIPE-${prefix}-${size.d || 25}${angle ? `-${angle}` : ""}`;
      }
    };

    for (const [, group] of nodeGroups.entries()) {
      const conns = group.connections;

      if (conns.length === 2) {
        const c1 = conns[0];
        const c2 = conns[1];

        const v1 = c1.isStart
          ? new THREE.Vector3().subVectors(new THREE.Vector3(...c1.seg.end), new THREE.Vector3(...c1.seg.start)).normalize()
          : new THREE.Vector3().subVectors(new THREE.Vector3(...c1.seg.start), new THREE.Vector3(...c1.seg.end)).normalize();

        const v2 = c2.isStart
          ? new THREE.Vector3().subVectors(new THREE.Vector3(...c2.seg.end), new THREE.Vector3(...c2.seg.start)).normalize()
          : new THREE.Vector3().subVectors(new THREE.Vector3(...c2.seg.start), new THREE.Vector3(...c2.seg.end)).normalize();

        const dot = v1.dot(v2);
        const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
        const angleDeg = Math.round((angleRad * 180) / Math.PI);

        if (angleDeg < 135) {
          const angle = Math.round(180 - angleDeg); // угол поворота (например, 90)
          const size = getSize(c1.seg);

          newFittings.push({
            id: `fit-${systemType}-bend-${Date.now()}-${Math.round(Math.random() * 1000)}`,
            type: "fitting",
            kind: "bend",
            systemType,
            angle,
            connects: [c1.seg.id, c2.seg.id],
            node: group.point,
            sortamentRef: getRef(c1.seg, "BEND", angle),
            size,
          });
        } else {
          // Соосное соединение. Проверяем разницу размеров
          const size1 = getSize(c1.seg);
          const size2 = getSize(c2.seg);

          let hasSizeDifference = false;
          if (systemType === "duct") {
            hasSizeDifference =
              c1.seg.shape !== c2.seg.shape ||
              (c1.seg.shape === "round" && size1.d !== size2.d) ||
              (c1.seg.shape === "rectangular" && (size1.w !== size2.w || size1.h !== size2.h));
          } else if (systemType === "tray") {
            hasSizeDifference = size1.w !== size2.w || size1.h !== size2.h;
          } else if (systemType === "pipe") {
            hasSizeDifference = size1.d !== size2.d;
          }

          if (hasSizeDifference) {
            newFittings.push({
              id: `fit-${systemType}-red-${Date.now()}-${Math.round(Math.random() * 1000)}`,
              type: "fitting",
              kind: "reducer",
              systemType,
              connects: [c1.seg.id, c2.seg.id],
              node: group.point,
              sortamentRef: getRef(c1.seg, "RED"),
              size: size1,
            });
          }
        }
      } else if (conns.length === 3) {
        const segIds = conns.map((c) => c.seg.id);
        
        // Находим сегмент с наибольшим размером сечения
        const largestConn = conns.reduce((prev, current) => {
          const sPrev = getSize(prev.seg);
          const sCurr = getSize(current.seg);
          const valPrev = sPrev.d || sPrev.w || 25;
          const valCurr = sCurr.d || sCurr.w || 25;
          return valPrev > valCurr ? prev : current;
        });

        newFittings.push({
          id: `fit-${systemType}-tee-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          type: "fitting",
          kind: "tee",
          systemType,
          connects: segIds,
          node: group.point,
          sortamentRef: getRef(largestConn.seg, "TEE"),
          size: getSize(largestConn.seg),
        });
      }
    }

    return newFittings;
  }
}
