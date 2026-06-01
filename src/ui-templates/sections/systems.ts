import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";

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

const openSystemSchemeWindow = (sys: any, elements: any[], rows: { label: string; value: string }[]) => {
  document.getElementById("system-scheme-window")?.remove();

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
  const project = (p: number[]) => {
    const x = Number(p[0] || 0);
    const y = Number(p[1] || 0) * yToMm;
    const z = Number(p[2] || 0);
    return {
      x: x + z * 0.52,
      y: z * 0.30 - y,
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

  const view = { x: 30, y: 22, w: 365, h: 202 };
  const scale = Math.min(view.w / Math.max(maxX - minX, 1), view.h / Math.max(maxY - minY, 1));
  const offsetX = view.x + (view.w - (maxX - minX) * scale) / 2;
  const offsetY = view.y + (view.h - (maxY - minY) * scale) / 2;
  const mapPoint = (p: number[]) => ({
    x: offsetX + (project(p).x - minX) * scale,
    y: offsetY + (project(p).y - minY) * scale,
  });

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
  const routeLength = (elem: any) => {
    if (!elem.start || !elem.end) return "";
    const d = [
      Number(elem.end[0] || 0) - Number(elem.start[0] || 0),
      (Number(elem.end[1] || 0) - Number(elem.start[1] || 0)) * yToMm,
      Number(elem.end[2] || 0) - Number(elem.start[2] || 0),
    ];
    const len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) / 1000;
    return len > 0.05 ? `${len.toFixed(1)} м` : "";
  };

  const lineMarkup = systemElements
    .filter((elem) => elem.start && elem.end)
    .map((elem, index) => {
      const a = mapPoint(elem.start);
      const b = mapPoint(elem.end);
      const width = elem.type === "duct" ? 1.8 : elem.type === "tray" ? 1.3 : 1.15;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const label = [routeLabel(elem), routeLength(elem)].filter(Boolean).join(" ");
      const showLabel = label && index % 2 === 0;
      return `
        <g>
          <line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="${strokeFor(elem)}" stroke-width="${width}" stroke-linecap="round" />
          <circle cx="${a.x.toFixed(2)}" cy="${a.y.toFixed(2)}" r="1.05" fill="#ffffff" stroke="${strokeFor(elem)}" stroke-width="0.45"/>
          <circle cx="${b.x.toFixed(2)}" cy="${b.y.toFixed(2)}" r="1.05" fill="#ffffff" stroke="${strokeFor(elem)}" stroke-width="0.45"/>
          ${showLabel ? `<text x="${(mid.x + 2).toFixed(2)}" y="${(mid.y - 2).toFixed(2)}" class="scheme-small-text">${escapeHtml(label)}</text>` : ""}
        </g>
      `;
    })
    .join("");

  const pointMarkup = systemElements
    .filter((elem) => elem.position || elem.node)
    .map((elem) => {
      const p = mapPoint(elem.position || elem.node);
      const label = elem.type === "radiator" ? "ПР" : elem.type === "fitting" ? "" : String(elem.type || "").slice(0, 3).toUpperCase();
      if (elem.type === "radiator") {
        return `<g transform="translate(${(p.x - 8).toFixed(2)} ${(p.y - 5).toFixed(2)})">
          <rect width="16" height="10" rx="0.8" fill="#ffffff" stroke="#ef4444" stroke-width="0.8"/>
          <path d="M3 2v6M6 2v6M9 2v6M12 2v6" stroke="#ef4444" stroke-width="0.45"/>
          <text x="0" y="-2" class="scheme-small-text">${label}</text>
        </g>`;
      }
      return `<g><circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="1.7" fill="#ffffff" stroke="#111827" stroke-width="0.55"/><text x="${(p.x + 2.5).toFixed(2)}" y="${(p.y - 2).toFixed(2)}" class="scheme-small-text">${escapeHtml(label)}</text></g>`;
    })
    .join("");

  const levelMarkup = systemElements
    .filter((elem) => elem.start && elem.end)
    .slice(0, 10)
    .map((elem) => {
      const a = mapPoint(elem.start);
      const b = mapPoint(elem.end);
      const p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const elev = Math.round(((Number(elem.start?.[1] || 0) + Number(elem.end?.[1] || 0)) / 2) * yToMm);
      const sign = elev >= 0 ? "+" : "-";
      return `<g class="scheme-level">
        <path d="M${p.x.toFixed(2)} ${p.y.toFixed(2)} l7 -7 h16" />
        <text x="${(p.x + 8).toFixed(2)}" y="${(p.y - 8.5).toFixed(2)}" class="scheme-small-text">отм. ${sign}${Math.abs(elev).toFixed(0)}</text>
      </g>`;
    })
    .join("");

  const specRows = rows.length
    ? rows.slice(0, 7).map((r, i) => `<text x="26" y="${246 + i * 5.2}" class="scheme-small-text">${escapeHtml(r.label)}: ${escapeHtml(r.value)}</text>`).join("")
    : `<text x="26" y="246" class="scheme-small-text">Спецификация появится после подключения элементов.</text>`;

  const overlay = document.createElement("div");
  overlay.id = "system-scheme-window";
  overlay.innerHTML = `
    <div class="system-scheme-backdrop">
      <div class="system-scheme-shell" role="dialog" aria-label="Схема системы">
        <div class="system-scheme-toolbar">
          <div>
            <div class="system-scheme-title">Схема системы ${escapeHtml(sys.name || sys.id)}</div>
            <div class="system-scheme-subtitle">Аксонометрия отопления · A3 · СПДС/ЕСКД v1</div>
          </div>
          <button class="system-scheme-close" type="button">Закрыть</button>
        </div>
        <div class="system-scheme-paper-wrap">
          <svg class="system-scheme-paper" viewBox="0 0 420 297" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <style>
                .scheme-text { font-family: Arial, sans-serif; fill: #111827; }
                .scheme-small-text { font-family: Arial, sans-serif; font-size: 3.2px; fill: #111827; }
                .scheme-tiny-text { font-family: Arial, sans-serif; font-size: 2.5px; fill: #111827; }
                .scheme-frame { fill: none; stroke: #111827; stroke-width: 0.45; }
                .scheme-thin { fill: none; stroke: #111827; stroke-width: 0.22; }
                .scheme-level path { fill: none; stroke: #111827; stroke-width: 0.25; }
              </style>
            </defs>
            <rect x="0" y="0" width="420" height="297" fill="#ffffff"/>
            <rect x="20" y="5" width="395" height="287" class="scheme-frame"/>
            <g class="scheme-tiny-text">
              ${Array.from({ length: 8 }, (_, i) => `<text x="${43 + i * 45}" y="4"> ${i + 1}</text>`).join("")}
              ${Array.from({ length: 5 }, (_, i) => `<text x="416" y="${39 + i * 45}">${String.fromCharCode(65 + i)}</text>`).join("")}
            </g>
            <text x="26" y="16" class="scheme-text" font-size="6" font-weight="700">Аксонометрическая схема системы отопления</text>
            <text x="26" y="22" class="scheme-small-text">${escapeHtml(sys.name || sys.id)} · ${escapeHtml(TYPE_LABEL[sys.type] || sys.type || "")}</text>
            <g class="scheme-thin" opacity="0.28">
              ${Array.from({ length: 9 }, (_, i) => `<line x1="${35 + i * 38}" y1="32" x2="${65 + i * 38}" y2="216" />`).join("")}
              ${Array.from({ length: 6 }, (_, i) => `<line x1="32" y1="${48 + i * 30}" x2="395" y2="${48 + i * 30}" />`).join("")}
            </g>
            <g>${lineMarkup}${pointMarkup}${levelMarkup}</g>
            <g class="scheme-small-text">
              <line x1="322" y1="20" x2="338" y2="20" stroke="#ef4444" stroke-width="1.2"/>
              <text x="341" y="21.2">Подача</text>
              <line x1="322" y1="27" x2="338" y2="27" stroke="#2563eb" stroke-width="1.2"/>
              <text x="341" y="28.2">Обратка</text>
            </g>
            <g>
              <text x="26" y="238" class="scheme-small-text" font-weight="700">Ведомость по системе</text>
              ${specRows}
            </g>
            <g class="scheme-frame">
              <rect x="20" y="237" width="62" height="55"/>
              <line x1="20" y1="244" x2="82" y2="244"/>
              <line x1="20" y1="251" x2="82" y2="251"/>
              <line x1="20" y1="258" x2="82" y2="258"/>
              <line x1="20" y1="265" x2="82" y2="265"/>
              <line x1="32" y1="237" x2="32" y2="265"/>
              <line x1="47" y1="237" x2="47" y2="265"/>
              <line x1="62" y1="237" x2="62" y2="265"/>
              <rect x="230" y="237" width="185" height="55"/>
              <line x1="230" y1="244" x2="415" y2="244"/>
              <line x1="230" y1="251" x2="415" y2="251"/>
              <line x1="230" y1="265" x2="415" y2="265"/>
              <line x1="230" y1="278" x2="415" y2="278"/>
              <line x1="242" y1="237" x2="242" y2="265"/>
              <line x1="258" y1="237" x2="258" y2="265"/>
              <line x1="279" y1="237" x2="279" y2="265"/>
              <line x1="298" y1="237" x2="298" y2="265"/>
              <line x1="328" y1="251" x2="328" y2="292"/>
              <line x1="368" y1="251" x2="368" y2="292"/>
            </g>
            <g class="scheme-tiny-text">
              <text x="22" y="242">Изм.</text><text x="34" y="242">Лист</text><text x="49" y="242">N док.</text><text x="64" y="242">Подп.</text>
              <text x="22" y="249">1</text><text x="34" y="249">1</text><text x="49" y="249">flow</text>
              <text x="232" y="242">Изм.</text><text x="244" y="242">Кол.</text><text x="260" y="242">Лист</text><text x="281" y="242">N док.</text><text x="300" y="242">Подп.</text>
              <text x="232" y="249">Разраб.</text><text x="260" y="249">Codex</text><text x="300" y="249">${new Date().toLocaleDateString("ru-RU")}</text>
              <text x="232" y="256">Пров.</text><text x="260" y="256">ОВ</text>
              <text x="232" y="262">Н.контр.</text>
              <text x="232" y="274" font-size="4">Аксонометрия отопления</text>
              <text x="330" y="260" font-size="4">${escapeHtml(sys.name || sys.id)}</text>
              <text x="370" y="260" font-size="4">ОВ.СО</text>
              <text x="330" y="287" font-size="4">Стадия: Э</text>
              <text x="370" y="287" font-size="4">Лист 1</text>
            </g>
          </svg>
        </div>
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

  overlay.querySelector(".system-scheme-close")?.addEventListener("click", close);
  overlay.querySelector(".system-scheme-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) close();
  });
  window.addEventListener("keydown", onKeyDown);
  document.body.appendChild(overlay);
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
