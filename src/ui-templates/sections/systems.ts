import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import {
  GOST_SHEET_FORMATS,
  GostSheetFormat,
  GostSheetStandard,
  getGostSheetLayout,
  renderGostSheetSvg,
} from "../sheets";

export interface SystemsPanelState {
  components: OBC.Components;
}

const TYPE_LABEL: Record<string, string> = {
  heating: "Отопление",
  conditioning: "Кондиционирование",
  ventilation: "Вентиляция",
  electrical: "Электрика",
  other: "Прочее",
};

const escapeHtml = (value: any) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getElementPoints = (elem: any): number[][] => {
  if (elem?.start && elem?.end) return [elem.start, elem.end];
  if (elem?.position) return [elem.position];
  if (elem?.node) return [elem.node];
  return [];
};

const buildSystemSchemeSvg = (
  sys: any,
  elements: any[],
  rows: { label: string; value: string }[],
  format: GostSheetFormat,
  standard: GostSheetStandard,
) => {
  const layout = getGostSheetLayout(format);
  const systemElements = elements.filter((x) => sys.elementIds?.includes(x.id) || x.systemId === sys.id);
  const points = systemElements.flatMap(getElementPoints).filter((p) => Array.isArray(p) && p.length >= 3);
  const horizontalSpan = Math.max(
    Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[2])) - Math.min(...points.map((p) => p[2])),
    1,
  );
  const yValues = points.map((p) => Number(p[1] || 0));
  const ySpan = Math.max(...yValues) - Math.min(...yValues);
  const yToMm = horizontalSpan > 50 && ySpan > 0 && ySpan < 20 ? 1000 : 1;
  // Фронтальная изометрия (ГОСТ 2.317): длина X — горизонтально, высота Y — вертикально,
  // глубина Z — под 45° вверх-вправо с сокращением 0.5 (фронтальная плоскость не искажается).
  const DEPTH = 0.5 * Math.SQRT1_2; // ≈ 0.354
  const project = (p: number[]) => {
    const x = Number(p[0] || 0);
    const y = Number(p[1] || 0) * yToMm;
    const z = Number(p[2] || 0);
    return {
      x: x + z * DEPTH,
      y: -y - z * DEPTH,
      rawY: y,
    };
  };

  const projected = points.length
    ? points.map(project)
    : [
        { x: -1000, y: -1000, rawY: 0 },
        { x: 1000, y: 1000, rawY: 0 },
      ];
  let minX = Math.min(...projected.map((p) => p.x));
  let maxX = Math.max(...projected.map((p) => p.x));
  let minY = Math.min(...projected.map((p) => p.y));
  let maxY = Math.max(...projected.map((p) => p.y));

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || minX === maxX) {
    minX = -1000;
    maxX = 1000;
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || minY === maxY) {
    minY = -1000;
    maxY = 1000;
  }

  const view = layout.drawingArea;
  const scale = Math.min(view.w / Math.max(maxX - minX, 1), view.h / Math.max(maxY - minY, 1));
  const offsetX = view.x + (view.w - (maxX - minX) * scale) / 2;
  const offsetY = view.y + (view.h - (maxY - minY) * scale) / 2;
  const mapPoint = (p: number[]) => ({
    x: offsetX + (project(p).x - minX) * scale,
    y: offsetY + (project(p).y - minY) * scale,
  });
  const routeElements = systemElements.filter((elem) => elem.start && elem.end);

  const strokeFor = (elem: any) => {
    if (elem.role === "supply") return "#ef4444";
    if (elem.role === "return") return "#2563eb";
    if (elem.type === "duct") return "#059669";
    if (elem.type === "tray") return "#d97706";
    return "#334155";
  };
  const routeLabel = (elem: any) => {
    if (elem.type === "pipe") {
      const d = elem.size?.d || elem.diameter || elem.d || 25;
      return `Ø${d}`;
    }
    if (elem.type === "duct") return elem.size?.w && elem.size?.h ? `${elem.size.w}x${elem.size.h}` : "В";
    if (elem.type === "tray") return "Л";
    return "";
  };
  const routeLengthValue = (elem: any) => {
    if (!elem.start || !elem.end) return 0;
    const d = [
      Number(elem.end[0] || 0) - Number(elem.start[0] || 0),
      (Number(elem.end[1] || 0) - Number(elem.start[1] || 0)) * yToMm,
      Number(elem.end[2] || 0) - Number(elem.start[2] || 0),
    ];
    return Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) / 1000;
  };

  const lineMarkup = routeElements
    .map((elem) => {
      const a = mapPoint(elem.start);
      const b = mapPoint(elem.end);
      const width = elem.type === "duct" ? 1.8 : elem.type === "tray" ? 1.3 : 1.15;
      return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="${strokeFor(elem)}" stroke-width="${width}" stroke-linecap="round" />`;
    })
    .join("");

  const representativeRoutes = new Map<string, any>();
  for (const elem of routeElements) {
    if (elem.type !== "pipe") continue;
    const key = `${elem.role || "pipe"}-${routeLabel(elem)}`;
    const current = representativeRoutes.get(key);
    if (!current || routeLengthValue(elem) > routeLengthValue(current)) {
      representativeRoutes.set(key, elem);
    }
  }

  const diameterMarkup = Array.from(representativeRoutes.values())
    .sort((a, b) => (a.role || "").localeCompare(b.role || ""))
    .slice(0, 4)
    .map((elem, index) => {
      const a = mapPoint(elem.start);
      const b = mapPoint(elem.end);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const role = elem.role === "supply" ? "П" : elem.role === "return" ? "О" : "";
      const label = [role, routeLabel(elem)].filter(Boolean).join(" ");
      const y = mid.y + (index % 2 === 0 ? -6 : 7);
      return `
        <g>
          <path d="M${mid.x.toFixed(2)} ${mid.y.toFixed(2)} l8 ${(y - mid.y).toFixed(2)} h22" class="scheme-leader"/>
          <text x="${(mid.x + 10).toFixed(2)}" y="${(y + 1).toFixed(2)}" class="scheme-small-text">${escapeHtml(label)}</text>
        </g>
      `;
    })
    .join("");

  const elevationPoints = new Map<number, number[]>();
  for (const elem of routeElements) {
    for (const p of [elem.start, elem.end]) {
      const elevation = Math.round(Number(p[1] || 0) * yToMm);
      if (!elevationPoints.has(elevation)) elevationPoints.set(elevation, p);
    }
  }
  const levelMarkup = Array.from(elevationPoints.entries())
    .filter(([elevation]) => elevation !== 0)
    .sort(([a], [b]) => Math.abs(b) - Math.abs(a))
    .slice(0, 4)
    .map(([elevation, point]) => {
      const p = mapPoint(point);
      const sign = elevation >= 0 ? "+" : "-";
      return `
        <g class="scheme-level">
          <path d="M${p.x.toFixed(2)} ${p.y.toFixed(2)} l7 -6 h24" />
          <text x="${(p.x + 8).toFixed(2)}" y="${(p.y - 7).toFixed(2)}" class="scheme-small-text">отм. ${sign}${Math.abs(elevation)}</text>
        </g>
      `;
    })
    .join("");

  const radiatorMarkup = systemElements
    .filter((elem) => elem.type === "radiator" && elem.position)
    .map((elem) => {
      const connected = routeElements.filter((route) => route.deviceId === elem.id);
      const anchors = connected.flatMap((route) => [route.start, route.end]);
      const mappedAnchors = anchors.length ? anchors.map(mapPoint) : [mapPoint(elem.position)];
      const minAnchorX = Math.min(...mappedAnchors.map((p) => p.x));
      const maxAnchorX = Math.max(...mappedAnchors.map((p) => p.x));
      const minAnchorY = Math.min(...mappedAnchors.map((p) => p.y));
      const centerX = (minAnchorX + maxAnchorX) / 2;
      const radiatorWidth = 20;
      const radiatorHeight = 12;
      const rx = centerX - radiatorWidth / 2;
      const ry = minAnchorY - radiatorHeight - 8;
      const connectorLines = connected
        .slice(0, 2)
        .map((route) => {
          const endpoints = [mapPoint(route.start), mapPoint(route.end)];
          const port = endpoints.sort((a, b) => a.y - b.y)[0];
          const targetX = route.role === "supply" ? rx + 5 : rx + radiatorWidth - 5;
          return `<line x1="${port.x.toFixed(2)}" y1="${port.y.toFixed(2)}" x2="${targetX.toFixed(2)}" y2="${(ry + radiatorHeight).toFixed(2)}" stroke="${strokeFor(route)}" stroke-width="0.7" stroke-linecap="round"/>`;
        })
        .join("");
      return `
        <g>
          ${connectorLines}
          <rect x="${rx.toFixed(2)}" y="${ry.toFixed(2)}" width="${radiatorWidth}" height="${radiatorHeight}" rx="0.8" fill="#ffffff" stroke="#ef4444" stroke-width="0.8"/>
          <path d="M${(rx + 4).toFixed(2)} ${(ry + 2).toFixed(2)}v8M${(rx + 8).toFixed(2)} ${(ry + 2).toFixed(2)}v8M${(rx + 12).toFixed(2)} ${(ry + 2).toFixed(2)}v8M${(rx + 16).toFixed(2)} ${(ry + 2).toFixed(2)}v8" stroke="#ef4444" stroke-width="0.45"/>
          <text x="${rx.toFixed(2)}" y="${(ry - 2).toFixed(2)}" class="scheme-small-text">ПР</text>
        </g>
      `;
    })
    .join("");

  const pointMarkup = systemElements
    .filter((elem) => elem.type !== "radiator" && (elem.position || elem.node))
    .map((elem) => {
      const p = mapPoint(elem.position || elem.node);
      const label = elem.type === "fitting" ? "" : String(elem.type || "").slice(0, 3).toUpperCase();
      return `<g><circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="1.7" fill="#ffffff" stroke="#111827" stroke-width="0.55"/><text x="${(p.x + 2.5).toFixed(2)}" y="${(p.y - 2).toFixed(2)}" class="scheme-small-text">${escapeHtml(label)}</text></g>`;
    })
    .join("");

  const specRows = rows.length
    ? rows
    : [{ label: "Ведомость", value: "заполнится после подключения элементов" }];

  const legend = `
    <g class="scheme-small-text">
      <line x1="${layout.frame.x + layout.frame.w - 88}" y1="${layout.frame.y + 15}" x2="${layout.frame.x + layout.frame.w - 72}" y2="${layout.frame.y + 15}" stroke="#ef4444" stroke-width="1.2"/>
      <text x="${layout.frame.x + layout.frame.w - 69}" y="${layout.frame.y + 16.2}">Подача</text>
      <line x1="${layout.frame.x + layout.frame.w - 88}" y1="${layout.frame.y + 22}" x2="${layout.frame.x + layout.frame.w - 72}" y2="${layout.frame.y + 22}" stroke="#2563eb" stroke-width="1.2"/>
      <text x="${layout.frame.x + layout.frame.w - 69}" y="${layout.frame.y + 23.2}">Обратка</text>
    </g>
  `;

  return renderGostSheetSvg({
    format,
    standard,
    meta: {
      objectName: "Flow-модель",
      buildingName: TYPE_LABEL[sys.type] || "Инженерные системы",
      drawingName: "Аксонометрическая схема системы отопления",
      documentName: sys.name || sys.id,
      designation: `${sys.id || "ОВ1"}-СО`,
      organization: "Замоделька",
      stage: "Р",
      sheet: "1",
      sheets: "1",
      scale: "Авто",
      format,
    },
    content: `<g>${lineMarkup}${diameterMarkup}${radiatorMarkup}${pointMarkup}${levelMarkup}</g>`,
    legend,
    specRows,
    specWidth: Math.min(125, layout.titleBlock.x - layout.frame.x - 12),
    specX: layout.frame.x + 6,
    specY: layout.titleBlock.y - Math.max(36, Math.min(specRows.length, format === "A3" ? 7 : 12) * 5 + 10),
  });
};

const openSystemSchemeWindow = (sys: any, elements: any[], rows: { label: string; value: string }[]) => {
  document.getElementById("system-scheme-window")?.remove();

  let currentFormat: GostSheetFormat = "A3";
  let currentStandard: GostSheetStandard = "SPDS";

  const overlay = document.createElement("div");
  overlay.id = "system-scheme-window";
  const formatButtons = (Object.keys(GOST_SHEET_FORMATS) as GostSheetFormat[])
    .map((format) => `<button class="system-scheme-option" data-format="${format}" type="button">${format}</button>`)
    .join("");
  overlay.innerHTML = `
    <div class="system-scheme-backdrop">
      <div class="system-scheme-shell" role="dialog" aria-label="Схема системы">
        <div class="system-scheme-toolbar">
          <div>
            <div class="system-scheme-title">Схема системы ${escapeHtml(sys.name || sys.id)}</div>
            <div class="system-scheme-subtitle">Аксонометрия отопления · альбомные шаблоны A3-A0 · СПДС/ЕСКД</div>
          </div>
          <div class="system-scheme-controls" aria-label="Параметры листа">
            <div class="system-scheme-segment" data-segment="formats">${formatButtons}</div>
            <div class="system-scheme-segment" data-segment="standards">
              <button class="system-scheme-option" data-standard="SPDS" type="button">СПДС</button>
              <button class="system-scheme-option" data-standard="ESKD" type="button">ЕСКД</button>
            </div>
          </div>
          <button class="system-scheme-close" type="button">Закрыть</button>
        </div>
        <div class="system-scheme-paper-wrap"></div>
      </div>
    </div>
    <style>
      #system-scheme-window .system-scheme-backdrop {
        position: fixed;
        inset: 0;
        z-index: 20000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 22px;
        background: rgba(15, 23, 42, 0.58);
        backdrop-filter: blur(6px);
      }
      #system-scheme-window .system-scheme-shell {
        width: min(96vw, 1280px);
        height: min(92vh, 920px);
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 12px;
        color: #0f172a;
      }
      #system-scheme-window .system-scheme-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 12px;
        border-radius: 8px;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
      }
      #system-scheme-window .system-scheme-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      #system-scheme-window .system-scheme-segment {
        display: inline-flex;
        align-items: center;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        overflow: hidden;
        background: #ffffff;
      }
      #system-scheme-window .system-scheme-option {
        border: 0;
        border-right: 1px solid #cbd5e1;
        background: #ffffff;
        color: #0f172a;
        padding: 7px 9px;
        font-weight: 800;
        cursor: pointer;
      }
      #system-scheme-window .system-scheme-option:last-child {
        border-right: 0;
      }
      #system-scheme-window .system-scheme-option.is-active {
        background: #0f172a;
        color: #ffffff;
      }
      #system-scheme-window .system-scheme-title {
        font-weight: 800;
        font-size: 16px;
      }
      #system-scheme-window .system-scheme-subtitle {
        color: #64748b;
        font-size: 12px;
        margin-top: 2px;
      }
      #system-scheme-window .system-scheme-close {
        border: 1px solid #94a3b8;
        background: #ffffff;
        color: #0f172a;
        border-radius: 6px;
        padding: 8px 12px;
        font-weight: 700;
        cursor: pointer;
      }
      #system-scheme-window .system-scheme-paper-wrap {
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #system-scheme-window .system-scheme-paper {
        max-width: 100%;
        max-height: 100%;
        aspect-ratio: 1.414 / 1;
        background: #ffffff;
        border: 1px solid #94a3b8;
        box-shadow: 0 28px 70px rgba(15, 23, 42, 0.35);
      }
    </style>
  `;

  const close = () => {
    overlay.remove();
    window.removeEventListener("keydown", onKeyDown);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  const renderSheet = () => {
    const wrap = overlay.querySelector(".system-scheme-paper-wrap");
    if (!wrap) return;
    wrap.innerHTML = buildSystemSchemeSvg(sys, elements, rows, currentFormat, currentStandard);
    overlay.querySelectorAll("[data-format]").forEach((button) => {
      button.classList.toggle("is-active", (button as HTMLElement).dataset.format === currentFormat);
    });
    overlay.querySelectorAll("[data-standard]").forEach((button) => {
      button.classList.toggle("is-active", (button as HTMLElement).dataset.standard === currentStandard);
    });
  };

  overlay.querySelector(".system-scheme-close")?.addEventListener("click", close);
  overlay.querySelector(".system-scheme-controls")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const format = target.dataset.format as GostSheetFormat | undefined;
    const standard = target.dataset.standard as GostSheetStandard | undefined;
    if (format && GOST_SHEET_FORMATS[format]) currentFormat = format;
    if (standard === "SPDS" || standard === "ESKD") currentStandard = standard;
    renderSheet();
  });
  overlay.querySelector(".system-scheme-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) close();
  });
  window.addEventListener("keydown", onKeyDown);
  document.body.appendChild(overlay);
  renderSheet();
};

/**
 * Вкладка «Системы» (FR-SYS-2). Показывает авто-сформированные системы (SystemManager):
 * имя (редактируемое), тип, расход (заглушка), объём, мини-спецификация по системе.
 */
export const systemsPanelTemplate: BUI.StatefullComponent<SystemsPanelState> = (
  _state,
  update,
) => {
  const listenerName = "__systemsPanelListener";
  if ((window as any)[listenerName]) {
    window.removeEventListener("systems-updated", (window as any)[listenerName]);
    window.removeEventListener("elements-updated", (window as any)[listenerName]);
  }
  (window as any)[listenerName] = () => update();
  window.addEventListener("systems-updated", (window as any)[listenerName]);
  window.addEventListener("elements-updated", (window as any)[listenerName]);

  const tool = (window as any).ductDrawingTool;
  const elements: any[] = tool ? tool.projectElements : [];
  const systems: any[] = (window as any).__projectSystems || [];

  const onRename = (id: string, e: any) => {
    const name = (e.target.value || "").trim() || id;
    if (!(window as any).__systemCustomNames) (window as any).__systemCustomNames = {};
    (window as any).__systemCustomNames[id] = name;
    const sys = systems.find((s) => s.id === id);
    if (sys) sys.name = name;
    update();
  };

  // мини-спецификация: тально по типам элементов системы
  const tally = (sys: any): { label: string; value: string }[] => {
    const els = elements.filter((x) => x.systemId === sys.id);
    const rows: { label: string; value: string }[] = [];
    const len = (x: any) => {
      const d = [x.end[0] - x.start[0], x.end[1] - x.start[1], x.end[2] - x.start[2]];
      return Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) / 1000;
    };
    const pipeLen = els.filter((x) => x.type === "pipe").reduce((s, x) => s + len(x), 0);
    const ductLen = els.filter((x) => x.type === "duct").reduce((s, x) => s + len(x), 0);
    const trayLen = els.filter((x) => x.type === "tray").reduce((s, x) => s + len(x), 0);
    if (pipeLen) rows.push({ label: "Трубопровод", value: `${pipeLen.toFixed(1)} м` });
    if (ductLen) rows.push({ label: "Воздуховод", value: `${ductLen.toFixed(1)} м` });
    if (trayLen) rows.push({ label: "Лоток", value: `${trayLen.toFixed(1)} м` });
    const counts: Record<string, { label: string; n: number }> = {
      radiator: { label: "Радиатор", n: 0 },
      ac: { label: "Кондиционер настенный", n: 0 },
      ac_ceiling: { label: "Кондиционер кассетный", n: 0 },
      equipment: { label: "Вентустановка", n: 0 },
      terminal: { label: "Решётка/диффузор", n: 0 },
      fitting: { label: "Фасонные детали", n: 0 },
      duct_accessory: { label: "Арматура ОВ", n: 0 },
      pipe_accessory: { label: "Арматура ВК", n: 0 },
    };
    for (const x of els) if (counts[x.type]) counts[x.type].n++;
    for (const k in counts) if (counts[k].n) rows.push({ label: counts[k].label, value: `${counts[k].n} шт` });
    return rows;
  };

  const cards = systems.map((sys) => {
    const rows = tally(sys);
    const onScheme = () => openSystemSchemeWindow(sys, elements, rows);
    return BUI.html`
      <div style="display:flex; flex-direction:column; gap:0.4rem; background-color:var(--bim-ui_bg-contrast-20); padding:0.6rem; border-radius:4px; border-left:3px solid var(--bim-ui_accent-base, #6528d7);">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <bim-text-input value=${sys.name} @change=${(e: any) => onRename(sys.id, e)} style="flex:1;"></bim-text-input>
          <span style="font-size:0.7rem; color:var(--bim-ui_bg-contrast-60); white-space:nowrap;">${TYPE_LABEL[sys.type] || sys.type}</span>
        </div>
        <div style="display:grid; grid-template-columns:auto 1fr; gap:0.15rem 0.6rem; font-size:0.8rem; color:var(--bim-ui_bg-contrast-100);">
          <span style="color:var(--bim-ui_bg-contrast-80);">Расход:</span><span>—</span>
          <span style="color:var(--bim-ui_bg-contrast-80);">Объём:</span><span>${sys.volume ? sys.volume.toFixed(3) : "0"} м³</span>
        </div>
        ${rows.length
          ? BUI.html`<div style="display:grid; grid-template-columns:1fr auto; gap:0.1rem 0.6rem; font-size:0.78rem; border-top:1px solid var(--bim-ui_bg-contrast-30); padding-top:0.3rem;">
              ${rows.map(
                (r) => BUI.html`<span style="color:var(--bim-ui_bg-contrast-80);">${r.label}</span><span style="color:var(--bim-ui_bg-contrast-100); text-align:right;">${r.value}</span>`,
              )}
            </div>`
          : ""}
        <bim-button label="Схема системы" icon="mdi:sitemap" @click=${onScheme} style="--bim-ui_accent-base:#3b82f6;"></bim-button>
      </div>
    `;
  });

  return BUI.html`
    <bim-panel-section fixed label="Системы" icon="mdi:vector-polyline">
      <div style="display:flex; flex-direction:column; gap:0.6rem; padding:0.5rem; height:100%; overflow:auto;">
        ${systems.length === 0
          ? BUI.html`<div style="text-align:center; color:var(--bim-ui_bg-contrast-60); padding:1.5rem; font-size:0.85rem;">Систем пока нет.<br/>Система появляется, когда трасса (труба/воздуховод) соединяется с прибором (радиатор, решётка и т.п.).</div>`
          : cards}
      </div>
    </bim-panel-section>
  `;
};
