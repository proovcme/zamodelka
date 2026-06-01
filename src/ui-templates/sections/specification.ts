import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import { BOMCalculator } from "../../bim-components/BOMCalculator";

export interface SpecificationPanelState {
  components: OBC.Components;
}

export const specificationPanelTemplate: BUI.StatefullComponent<
  SpecificationPanelState
> = (_, update) => {
  
  // Перерисовываем спецификацию при изменении элементов трассы
  const listenerName = "__specificationUpdateListener";
  if ((window as any)[listenerName]) {
    window.removeEventListener("tool-deactivated", (window as any)[listenerName]);
    window.removeEventListener("custom-element-selected", (window as any)[listenerName]);
    window.removeEventListener("elements-updated", (window as any)[listenerName]);
  }
  (window as any)[listenerName] = () => update();
  window.addEventListener("tool-deactivated", (window as any)[listenerName]);
  window.addEventListener("custom-element-selected", (window as any)[listenerName]);
  window.addEventListener("elements-updated", (window as any)[listenerName]);
  
  const ductTool = (window as any).ductDrawingTool;
  const elements = ductTool ? ductTool.projectElements : [];
  
  const bom = BOMCalculator.calculate(elements);

  const rows: BUI.TemplateResult[] = [];
  const wallRows: BUI.TemplateResult[] = [];

  // 1. Воздуховоды
  if (bom.ducts.length > 0) {
    rows.push(BUI.html`
      <div style="grid-column: span 4; background-color: var(--bim-ui_bg-contrast-20); font-weight: bold; padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); color: var(--bim-ui_accent-base, #4179b5);">
        1. Воздуховоды
      </div>
    `);
    
    bom.ducts.forEach((d) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.sizeLabel}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${d.length.toFixed(1)} м`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${d.surfaceArea.toFixed(1)} м²`}</div>
      `);
    });

    // Итоговая строка: суммарная длина и площадь поверхности воздуховодов (под покраску/изоляцию)
    const totalLength = bom.ducts.reduce((sum, d) => sum + d.length, 0);
    const totalArea = bom.ducts.reduce((sum, d) => sum + d.surfaceArea, 0);
    rows.push(BUI.html`
      <div style="grid-column: span 2; color: var(--bim-ui_bg-contrast-100); font-weight: bold; padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); text-align: right;">Итого по воздуховодам:</div>
      <div style="color: var(--bim-ui_bg-contrast-100); font-weight: bold; padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); white-space: nowrap;">${`${totalLength.toFixed(1)} м`}</div>
      <div style="color: var(--bim-ui_bg-contrast-100); font-weight: bold; padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); white-space: nowrap;">${`${totalArea.toFixed(1)} м²`}</div>
    `);
  }

  // 1.5 Стены
  if (bom.walls.length > 0) {
    bom.walls.forEach((w) => {
      const charLabel = `Высота: ${w.height}мм, Толщина: ${w.thickness}мм`;
      
      wallRows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${w.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${charLabel}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${w.volume.toFixed(2)} м³`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${w.length.toFixed(1)} м / ${w.surfaceArea.toFixed(1)} м²`}</div>
      `);
    });

    const totalVolume = bom.walls.reduce((sum, w) => sum + w.volume, 0);
    const totalLength = bom.walls.reduce((sum, w) => sum + w.length, 0);
    wallRows.push(BUI.html`
      <div style="grid-column: span 2; color: var(--bim-ui_bg-contrast-100); font-weight: bold; padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); text-align: right;">Итого по стенам:</div>
      <div style="color: var(--bim-ui_bg-contrast-100); font-weight: bold; padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); white-space: nowrap;">${`${totalVolume.toFixed(2)} м³`}</div>
      <div style="color: var(--bim-ui_bg-contrast-100); font-weight: bold; padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); white-space: nowrap;">${`${totalLength.toFixed(1)} м`}</div>
    `);
  }

  // 1.2 Кабельные лотки
  if (bom.trays.length > 0) {
    rows.push(BUI.html`
      <div style="grid-column: span 4; background-color: var(--bim-ui_bg-contrast-20); font-weight: bold; padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); color: var(--bim-ui_accent-base, #4179b5);">
        1.2 Кабельные лотки
      </div>
    `);
    bom.trays.forEach((t) => {
      let kindLabel = t.kind === "solid" ? "Сплошной" : t.kind === "perforated" ? "Перфорированный" : "Лестничный";
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${t.width}x${t.height} мм`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${t.length.toFixed(1)} м`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${kindLabel}</div>
      `);
    });
    const totalTrayLength = bom.trays.reduce((sum, t) => sum + t.length, 0);
    rows.push(BUI.html`
      <div style="grid-column: span 2; color: var(--bim-ui_bg-contrast-100); font-weight: bold; padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); text-align: right;">Итого по лоткам:</div>
      <div style="color: var(--bim-ui_bg-contrast-100); font-weight: bold; padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); white-space: nowrap;">${`${totalTrayLength.toFixed(1)} м`}</div>
      <div style="color: var(--bim-ui_bg-contrast-100); font-weight: bold; padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); white-space: nowrap;"></div>
    `);
  }

  // 1.3 Трубопроводы
  if (bom.pipes.length > 0) {
    rows.push(BUI.html`
      <div style="grid-column: span 4; background-color: var(--bim-ui_bg-contrast-20); font-weight: bold; padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); color: var(--bim-ui_accent-base, #4179b5);">
        1.3 Трубопроводы
      </div>
    `);
    bom.pipes.forEach((p) => {
      let matLabel = p.material === "steel_water" ? "Сталь" : "ППР";
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`⌀${p.d} мм (${matLabel})`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${p.length.toFixed(1)} м`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${p.weight.toFixed(1)} кг`}</div>
      `);
    });
    const totalPipeLength = bom.pipes.reduce((sum, p) => sum + p.length, 0);
    const totalPipeWeight = bom.pipes.reduce((sum, p) => sum + p.weight, 0);
    rows.push(BUI.html`
      <div style="grid-column: span 2; color: var(--bim-ui_bg-contrast-100); font-weight: bold; padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); text-align: right;">Итого по трубам:</div>
      <div style="color: var(--bim-ui_bg-contrast-100); font-weight: bold; padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); white-space: nowrap;">${`${totalPipeLength.toFixed(1)} м`}</div>
      <div style="color: var(--bim-ui_bg-contrast-100); font-weight: bold; padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); white-space: nowrap;">${`${totalPipeWeight.toFixed(1)} кг`}</div>
    `);
  }

  // 2. Фасонные детали
  if (bom.fittings.length > 0) {
    rows.push(BUI.html`
      <div style="grid-column: span 4; background-color: var(--bim-ui_bg-contrast-20); font-weight: bold; padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); color: var(--bim-ui_accent-base, #4179b5);">
        2. Соединительные детали
      </div>
    `);
    
    bom.fittings.forEach((f) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${f.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${f.sizeLabel}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${f.quantity} шт`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>
      `);
    });
  }

  // 2.2 Арматура и автоматика ОВ
  if (bom.ductAccessories.length > 0) {
    rows.push(BUI.html`
      <div style="grid-column: span 4; background-color: var(--bim-ui_bg-contrast-20); font-weight: bold; padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); color: var(--bim-ui_accent-base, #4179b5);">
        2.2 Арматура и автоматика ОВ
      </div>
    `);
    bom.ductAccessories.forEach((acc) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${acc.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${acc.sizeLabel}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${acc.quantity} шт`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>
      `);
    });
  }

  // 2.3 Арматура ВК
  if (bom.pipeAccessories.length > 0) {
    rows.push(BUI.html`
      <div style="grid-column: span 4; background-color: var(--bim-ui_bg-contrast-20); font-weight: bold; padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); color: var(--bim-ui_accent-base, #4179b5);">
        2.3 Арматура ВК
      </div>
    `);
    bom.pipeAccessories.forEach((acc) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${acc.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${acc.sizeLabel}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${acc.quantity} шт`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>
      `);
    });
  }

  // 3. Оборудование и решетки
  if (bom.equipment.length > 0 || bom.terminals.length > 0 || bom.acs.length > 0 || bom.radiators.length > 0) {
    rows.push(BUI.html`
      <div style="grid-column: span 4; background-color: var(--bim-ui_bg-contrast-20); font-weight: bold; padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); color: var(--bim-ui_accent-base, #4179b5);">
        3. Оборудование и приборы
      </div>
    `);

    bom.equipment.forEach((eq) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${eq.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${eq.model}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${eq.quantity} шт`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${eq.sizeLabel}</div>
      `);
    });

    bom.acs.forEach((ac) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${ac.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${ac.model}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${ac.quantity} шт`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Настенная</div>
      `);
    });

    bom.radiators.forEach((rad) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${rad.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${rad.model}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${rad.quantity} шт`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Настенный</div>
      `);
    });

    bom.terminals.forEach((term) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${term.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${term.model}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${term.quantity} шт`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>
      `);
    });
  }

  // 4. Электрооборудование и освещение
  if (bom.sockets.length > 0 || bom.panels.length > 0 || bom.lights.length > 0) {
    rows.push(BUI.html`
      <div style="grid-column: span 4; background-color: var(--bim-ui_bg-contrast-20); font-weight: bold; padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); color: var(--bim-ui_accent-base, #4179b5);">
        4. Электрооборудование и освещение
      </div>
    `);

    bom.panels.forEach((p) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.model}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${p.quantity} шт`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>
      `);
    });

    bom.sockets.forEach((s) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${s.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${s.model}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${s.quantity} шт`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Настенная</div>
      `);
    });

    bom.lights.forEach((l) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${l.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${l.model}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${l.quantity} шт`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Потолочная</div>
      `);
    });
  }

  // 5. Архитектурные заполнения
  if (bom.doors.length > 0 || bom.windows.length > 0) {
    rows.push(BUI.html`
      <div style="grid-column: span 4; background-color: var(--bim-ui_bg-contrast-20); font-weight: bold; padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-30); color: var(--bim-ui_accent-base, #4179b5);">
        5. Архитектурные заполнения
      </div>
    `);

    bom.doors.forEach((d) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.model}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${d.quantity} шт`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">В проеме</div>
      `);
    });

    bom.windows.forEach((w) => {
      rows.push(BUI.html`
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${w.name}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${w.model}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${`${w.quantity} шт`}</div>
        <div style="color: var(--bim-ui_bg-contrast-100); padding: 0.4rem 0.35rem; font-size: 0.8rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">В проеме</div>
      `);
    });
  }

  const sectionId = BUI.Manager.newRandomId();

  return BUI.html`
    <div style="display: flex; flex-direction: column; gap: 0.5rem; height: 100%; overflow: auto;">
      <bim-panel-section fixed id=${sectionId} icon="mdi:format-list-numbered" label="Ведомость спецификации">
        <div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;">
          ${rows.length > 0 
            ? BUI.html`
                <div style="display: grid; grid-template-columns: 2.5fr 1.5fr 1fr 1fr; width: 100%; border-top: 1px solid var(--bim-ui_bg-contrast-20); margin-top: 0.25rem;">
                  <!-- Header row -->
                  <div style="font-weight: bold; background-color: var(--bim-ui_bg-contrast-15); color: var(--bim-ui_bg-contrast-100); padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 2px solid var(--bim-ui_bg-contrast-30);">Наименование</div>
                  <div style="font-weight: bold; background-color: var(--bim-ui_bg-contrast-15); color: var(--bim-ui_bg-contrast-100); padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 2px solid var(--bim-ui_bg-contrast-30);">Характеристика</div>
                  <div style="font-weight: bold; background-color: var(--bim-ui_bg-contrast-15); color: var(--bim-ui_bg-contrast-100); padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 2px solid var(--bim-ui_bg-contrast-30);">Кол-во / Длина</div>
                  <div style="font-weight: bold; background-color: var(--bim-ui_bg-contrast-15); color: var(--bim-ui_bg-contrast-100); padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 2px solid var(--bim-ui_bg-contrast-30);">Параметры</div>
                  
                  ${rows}
                </div>
              `
            : BUI.html`<div style="text-align: center; color: var(--bim-ui_bg-contrast-60); padding: 2rem; font-size: 0.9rem;">Начертите трассу для расчета спецификации</div>`
          }
        </div>
      </bim-panel-section>
      
      ${wallRows.length > 0 
        ? BUI.html`
            <bim-panel-section collapsed icon="mdi:wall" label="1.5 Стены">
              <div style="display: grid; grid-template-columns: 2.5fr 1.5fr 1fr 1fr; width: 100%; border-top: 1px solid var(--bim-ui_bg-contrast-20);">
                <!-- Header row -->
                <div style="font-weight: bold; background-color: var(--bim-ui_bg-contrast-15); color: var(--bim-ui_bg-contrast-100); padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 2px solid var(--bim-ui_bg-contrast-30);">Наименование</div>
                <div style="font-weight: bold; background-color: var(--bim-ui_bg-contrast-15); color: var(--bim-ui_bg-contrast-100); padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 2px solid var(--bim-ui_bg-contrast-30);">Характеристика</div>
                <div style="font-weight: bold; background-color: var(--bim-ui_bg-contrast-15); color: var(--bim-ui_bg-contrast-100); padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 2px solid var(--bim-ui_bg-contrast-30);">Кол-во / Длина</div>
                <div style="font-weight: bold; background-color: var(--bim-ui_bg-contrast-15); color: var(--bim-ui_bg-contrast-100); padding: 0.5rem 0.35rem; font-size: 0.85rem; border-bottom: 2px solid var(--bim-ui_bg-contrast-30);">Параметры</div>
                
                ${wallRows}
              </div>
            </bim-panel-section>
          `
        : BUI.html``
      }
    </div>
  `;
};
