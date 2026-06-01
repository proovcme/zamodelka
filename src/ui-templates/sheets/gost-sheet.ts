export const GOST_SHEET_FORMATS = {
  A3: { width: 420, height: 297 },
  A2: { width: 594, height: 420 },
  A1: { width: 841, height: 594 },
  A0: { width: 1189, height: 841 },
} as const;

export type GostSheetFormat = keyof typeof GOST_SHEET_FORMATS;
export type GostSheetStandard = "SPDS" | "ESKD";
export type GostSheetOrientation = "landscape";

export interface GostSheetLayout {
  format: GostSheetFormat;
  standard: GostSheetStandard;
  orientation: GostSheetOrientation;
  width: number;
  height: number;
  outer: Rect;
  frame: Rect;
  drawingArea: Rect;
  titleBlock: Rect;
  revisionBlock: Rect;
}

export interface GostSheetMeta {
  objectName?: string;
  buildingName?: string;
  drawingName?: string;
  documentName?: string;
  designation?: string;
  organization?: string;
  stage?: string;
  sheet?: string;
  sheets?: string;
  scale?: string;
  date?: string;
  format?: GostSheetFormat;
}

export interface GostSheetRenderOptions {
  format: GostSheetFormat;
  standard: GostSheetStandard;
  meta: GostSheetMeta;
  content: string;
  legend?: string;
  specRows?: { label: string; value: string }[];
  specWidth?: number;
  specX?: number;
  specY?: number;
  className?: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const LEFT_MARGIN = 20;
const OTHER_MARGIN = 5;
const TITLE_BLOCK_WIDTH = 185;
const TITLE_BLOCK_HEIGHT = 55;
const REVISION_BLOCK_WIDTH = 65;

const escapeXml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export function getGostSheetLayout(
  format: GostSheetFormat,
  standard: GostSheetStandard = "SPDS",
): GostSheetLayout {
  const size = GOST_SHEET_FORMATS[format];
  const outer = { x: 0, y: 0, w: size.width, h: size.height };
  const frame = {
    x: LEFT_MARGIN,
    y: OTHER_MARGIN,
    w: size.width - LEFT_MARGIN - OTHER_MARGIN,
    h: size.height - OTHER_MARGIN * 2,
  };
  const titleBlock = {
    x: frame.x + frame.w - TITLE_BLOCK_WIDTH,
    y: frame.y + frame.h - TITLE_BLOCK_HEIGHT,
    w: TITLE_BLOCK_WIDTH,
    h: TITLE_BLOCK_HEIGHT,
  };
  const revisionBlock = {
    x: frame.x,
    y: titleBlock.y,
    w: REVISION_BLOCK_WIDTH,
    h: TITLE_BLOCK_HEIGHT,
  };
  const drawingArea = {
    x: frame.x + 8,
    y: frame.y + 8,
    w: frame.w - 16,
    h: titleBlock.y - frame.y - 16,
  };

  return {
    format,
    standard,
    orientation: "landscape",
    width: size.width,
    height: size.height,
    outer,
    frame,
    drawingArea,
    titleBlock,
    revisionBlock,
  };
}

export function renderGostSheetSvg(options: GostSheetRenderOptions) {
  const layout = getGostSheetLayout(options.format, options.standard);
  const className = options.className || "gost-sheet-svg system-scheme-paper";
  const meta: Required<GostSheetMeta> = {
    objectName: options.meta.objectName || "Объект строительства",
    buildingName: options.meta.buildingName || "Здание",
    drawingName: options.meta.drawingName || "Аксонометрическая схема",
    documentName: options.meta.documentName || "Система отопления",
    designation: options.meta.designation || "ОВ.СО",
    organization: options.meta.organization || "Замоделька",
    stage: options.meta.stage || "Р",
    sheet: options.meta.sheet || "1",
    sheets: options.meta.sheets || "1",
    scale: options.meta.scale || "Авто",
    date: options.meta.date || new Date().toLocaleDateString("ru-RU"),
    format: options.format,
  };

  const titleBlock = options.standard === "SPDS"
    ? renderSpdsForm3(layout.titleBlock, meta)
    : renderEskdForm1(layout.titleBlock, meta);

  return `
    <svg class="${className}" viewBox="0 0 ${layout.width} ${layout.height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(meta.drawingName)}">
      <defs>${renderSheetStyles()}</defs>
      <rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="#ffffff"/>
      ${renderFrame(layout)}
      ${renderZones(layout)}
      ${renderRevisionBlock(layout.revisionBlock)}
      ${options.legend || ""}
      <g>${options.content}</g>
      ${renderSpecBlock(layout, options.specRows || [], options)}
      ${titleBlock}
    </svg>
  `;
}

export function createGostSheetTemplate(
  format: GostSheetFormat,
  standard: GostSheetStandard = "SPDS",
) {
  const layout = getGostSheetLayout(format, standard);
  return {
    layout,
    render: (options: Omit<GostSheetRenderOptions, "format" | "standard">) =>
      renderGostSheetSvg({ ...options, format, standard }),
  };
}

function renderSheetStyles() {
  return `
    <style>
      .sheet-frame { fill: none; stroke: #111827; stroke-width: 0.5; vector-effect: non-scaling-stroke; }
      .sheet-thin { fill: none; stroke: #111827; stroke-width: 0.18; vector-effect: non-scaling-stroke; }
      .sheet-medium { fill: none; stroke: #111827; stroke-width: 0.32; vector-effect: non-scaling-stroke; }
      .sheet-zone { font-family: Arial, sans-serif; font-size: 2.8px; fill: #111827; }
      .sheet-small { font-family: Arial, sans-serif; font-size: 2.5px; fill: #111827; }
      .sheet-tiny { font-family: Arial, sans-serif; font-size: 2.1px; fill: #111827; }
      .scheme-small-text { font-family: Arial, sans-serif; font-size: 3.2px; fill: #111827; }
      .scheme-leader { fill: none; stroke: #111827; stroke-width: 0.22; vector-effect: non-scaling-stroke; }
      .scheme-level path { fill: none; stroke: #111827; stroke-width: 0.25; vector-effect: non-scaling-stroke; }
    </style>
  `;
}

function renderFrame(layout: GostSheetLayout) {
  const { frame } = layout;
  return `
    <rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" class="sheet-frame"/>
  `;
}

function renderZones(layout: GostSheetLayout) {
  const { frame } = layout;
  const zoneStep = layout.format === "A3" ? 50 : 100;
  const verticalCount = Math.max(1, Math.floor(frame.w / zoneStep));
  const horizontalCount = Math.max(1, Math.floor(frame.h / zoneStep));
  const verticalLabels = Array.from({ length: verticalCount }, (_, index) => {
    const x = frame.x + ((index + 0.5) * frame.w) / verticalCount;
    return `<text x="${x.toFixed(2)}" y="${(frame.y - 1.2).toFixed(2)}" text-anchor="middle" class="sheet-zone">${index + 1}</text>`;
  }).join("");
  const horizontalLabels = Array.from({ length: horizontalCount }, (_, index) => {
    const y = frame.y + ((index + 0.5) * frame.h) / horizontalCount;
    return `<text x="${(frame.x + frame.w + 1.6).toFixed(2)}" y="${(y + 1).toFixed(2)}" class="sheet-zone">${String.fromCharCode(65 + index)}</text>`;
  }).join("");

  return `<g>${verticalLabels}${horizontalLabels}</g>`;
}

function renderRevisionBlock(rect: Rect) {
  const rows = [0, 7, 14, 21, 28];
  const cols = [0, 12, 27, 42, 55, rect.w];
  const horizontal = rows.map((dy) => `<line x1="${rect.x}" y1="${rect.y + dy}" x2="${rect.x + rect.w}" y2="${rect.y + dy}" class="sheet-thin"/>`).join("");
  const vertical = cols.map((dx) => `<line x1="${rect.x + dx}" y1="${rect.y}" x2="${rect.x + dx}" y2="${rect.y + 28}" class="sheet-thin"/>`).join("");
  return `
    <g>
      <rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" class="sheet-medium"/>
      ${horizontal}${vertical}
      <text x="${rect.x + 1.5}" y="${rect.y + 5}" class="sheet-tiny">Изм.</text>
      <text x="${rect.x + 14}" y="${rect.y + 5}" class="sheet-tiny">Кол.</text>
      <text x="${rect.x + 29}" y="${rect.y + 5}" class="sheet-tiny">Лист</text>
      <text x="${rect.x + 44}" y="${rect.y + 5}" class="sheet-tiny">N док.</text>
      <text x="${rect.x + 56}" y="${rect.y + 5}" class="sheet-tiny">Подп.</text>
    </g>
  `;
}

function renderSpecBlock(
  layout: GostSheetLayout,
  rows: { label: string; value: string }[],
  options: Pick<GostSheetRenderOptions, "specWidth" | "specX" | "specY">,
) {
  const maxRows = layout.format === "A3" ? 7 : 12;
  const visibleRows = rows.slice(0, maxRows);
  const x = options.specX ?? layout.frame.x + 6;
  const y = options.specY ?? layout.titleBlock.y - Math.max(24, visibleRows.length * 5 + 8);
  const width = options.specWidth ?? 92;
  const height = Math.max(24, visibleRows.length * 5 + 8);
  const valueX = x + width - 4;
  const textRows = visibleRows.length
    ? visibleRows.map((row, index) => `
        <text x="${x + 2}" y="${y + 10 + index * 5}" class="sheet-small">${escapeXml(row.label)}</text>
        <text x="${valueX}" y="${y + 10 + index * 5}" class="sheet-small" text-anchor="end">${escapeXml(row.value)}</text>
      `).join("")
    : `<text x="${x + 2}" y="${y + 10}" class="sheet-small">Ведомость заполнится после подключения элементов</text>`;

  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" class="sheet-thin"/>
      <text x="${x + 2}" y="${y + 5}" class="sheet-small" font-weight="700">Ведомость по системе</text>
      ${textRows}
    </g>
  `;
}

function renderSpdsForm3(rect: Rect, meta: Required<GostSheetMeta>) {
  const x = rect.x;
  const y = rect.y;
  const w = rect.w;
  const h = rect.h;
  const v = (dx: number, y1 = 0, y2 = h) => `<line x1="${x + dx}" y1="${y + y1}" x2="${x + dx}" y2="${y + y2}" class="sheet-thin"/>`;
  const hz = (dy: number, x1 = 0, x2 = w) => `<line x1="${x + x1}" y1="${y + dy}" x2="${x + x2}" y2="${y + dy}" class="sheet-thin"/>`;

  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" class="sheet-medium"/>
      ${[5, 10, 15, 20, 25, 35, 45].map((dy) => hz(dy)).join("")}
      ${v(15, 0, 25)}${v(35, 0, 25)}${v(55, 0, 25)}${v(65)}
      ${v(135)}${v(150, 25)}${v(165, 25)}
      ${hz(30, 135)}${hz(40, 135)}${hz(50, 135)}
      <text x="${x + 2}" y="${y + 4}" class="sheet-tiny">Изм.</text>
      <text x="${x + 17}" y="${y + 4}" class="sheet-tiny">Кол.</text>
      <text x="${x + 37}" y="${y + 4}" class="sheet-tiny">Лист</text>
      <text x="${x + 57}" y="${y + 4}" class="sheet-tiny">N док.</text>
      <text x="${x + 2}" y="${y + 29}" class="sheet-tiny">Разраб.</text>
      <text x="${x + 2}" y="${y + 34}" class="sheet-tiny">Пров.</text>
      <text x="${x + 2}" y="${y + 39}" class="sheet-tiny">Т.контр.</text>
      <text x="${x + 2}" y="${y + 44}" class="sheet-tiny">Н.контр.</text>
      <text x="${x + 2}" y="${y + 49}" class="sheet-tiny">ГИП</text>
      <text x="${x + 67}" y="${y + 7}" class="sheet-small">${escapeXml(meta.designation)}</text>
      <text x="${x + 67}" y="${y + 18}" class="sheet-small">${escapeXml(meta.objectName)}</text>
      <text x="${x + 67}" y="${y + 29}" class="sheet-small">${escapeXml(meta.buildingName)}</text>
      <text x="${x + 67}" y="${y + 40}" class="sheet-small" font-weight="700">${escapeXml(meta.drawingName)}</text>
      <text x="${x + 137}" y="${y + 29}" class="sheet-tiny">Стадия</text>
      <text x="${x + 153}" y="${y + 29}" class="sheet-tiny">Лист</text>
      <text x="${x + 168}" y="${y + 29}" class="sheet-tiny">Листов</text>
      <text x="${x + 141}" y="${y + 37}" class="sheet-small">${escapeXml(meta.stage)}</text>
      <text x="${x + 156}" y="${y + 37}" class="sheet-small">${escapeXml(meta.sheet)}</text>
      <text x="${x + 173}" y="${y + 37}" class="sheet-small">${escapeXml(meta.sheets)}</text>
      <text x="${x + 137}" y="${y + 48}" class="sheet-tiny">Формат</text>
      <text x="${x + 153}" y="${y + 48}" class="sheet-tiny">Масштаб</text>
      <text x="${x + 170}" y="${y + 48}" class="sheet-tiny">Дата</text>
      <text x="${x + 138}" y="${y + 54}" class="sheet-tiny">${escapeXml(meta.format)}</text>
      <text x="${x + 154}" y="${y + 54}" class="sheet-tiny">${escapeXml(meta.scale)}</text>
      <text x="${x + 168}" y="${y + 54}" class="sheet-tiny">${escapeXml(meta.date)}</text>
      <text x="${x + 67}" y="${y + 53}" class="sheet-small">${escapeXml(meta.organization)}</text>
    </g>
  `;
}

function renderEskdForm1(rect: Rect, meta: Required<GostSheetMeta>) {
  const x = rect.x;
  const y = rect.y;
  const w = rect.w;
  const h = rect.h;
  const v = (dx: number, y1 = 0, y2 = h) => `<line x1="${x + dx}" y1="${y + y1}" x2="${x + dx}" y2="${y + y2}" class="sheet-thin"/>`;
  const hz = (dy: number, x1 = 0, x2 = w) => `<line x1="${x + x1}" y1="${y + dy}" x2="${x + x2}" y2="${y + dy}" class="sheet-thin"/>`;

  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" class="sheet-medium"/>
      ${[5, 10, 15, 20, 25, 40].map((dy) => hz(dy)).join("")}
      ${v(7, 0, 25)}${v(17, 0, 25)}${v(40, 0, 25)}${v(55, 0, 25)}${v(65)}
      ${v(120)}${v(140)}${v(155)}${v(170)}
      ${hz(45, 120)}${hz(50, 120)}
      <text x="${x + 1.5}" y="${y + 4}" class="sheet-tiny">Изм.</text>
      <text x="${x + 8.5}" y="${y + 4}" class="sheet-tiny">Лист</text>
      <text x="${x + 18.5}" y="${y + 4}" class="sheet-tiny">N докум.</text>
      <text x="${x + 42}" y="${y + 4}" class="sheet-tiny">Подп.</text>
      <text x="${x + 56}" y="${y + 4}" class="sheet-tiny">Дата</text>
      <text x="${x + 2}" y="${y + 29}" class="sheet-tiny">Разраб.</text>
      <text x="${x + 2}" y="${y + 34}" class="sheet-tiny">Пров.</text>
      <text x="${x + 2}" y="${y + 39}" class="sheet-tiny">Т.контр.</text>
      <text x="${x + 2}" y="${y + 44}" class="sheet-tiny">Н.контр.</text>
      <text x="${x + 2}" y="${y + 49}" class="sheet-tiny">Утв.</text>
      <text x="${x + 67}" y="${y + 9}" class="sheet-small" font-weight="700">${escapeXml(meta.documentName)}</text>
      <text x="${x + 67}" y="${y + 20}" class="sheet-small">${escapeXml(meta.drawingName)}</text>
      <text x="${x + 67}" y="${y + 33}" class="sheet-small">${escapeXml(meta.designation)}</text>
      <text x="${x + 122}" y="${y + 44}" class="sheet-tiny">Лит.</text>
      <text x="${x + 142}" y="${y + 44}" class="sheet-tiny">Масса</text>
      <text x="${x + 157}" y="${y + 44}" class="sheet-tiny">Масштаб</text>
      <text x="${x + 123}" y="${y + 53}" class="sheet-tiny">${escapeXml(meta.stage)}</text>
      <text x="${x + 158}" y="${y + 53}" class="sheet-tiny">${escapeXml(meta.scale)}</text>
      <text x="${x + 172}" y="${y + 44}" class="sheet-tiny">Лист ${escapeXml(meta.sheet)}</text>
      <text x="${x + 172}" y="${y + 53}" class="sheet-tiny">Листов ${escapeXml(meta.sheets)}</text>
      <text x="${x + 67}" y="${y + 53}" class="sheet-small">${escapeXml(meta.organization)}</text>
    </g>
  `;
}
