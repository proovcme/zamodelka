# GOST Sheet Templates

Единый модуль листов для чертежной документации.

## Что внутри

- Альбомные форматы `A3`, `A2`, `A1`, `A0`.
- Размеры листов в миллиметрах.
- Рамка листа: левое поле `20 мм`, остальные поля `5 мм`.
- Рабочее поле `drawingArea`.
- Основная надпись `185 x 55 мм`.
- Левая таблица изменений.
- Два режима основной надписи:
  - `SPDS` — листы основных комплектов.
  - `ESKD` — чертежи и схемы.

## API

```ts
import {
  createGostSheetTemplate,
  getGostSheetLayout,
  renderGostSheetSvg,
} from "../sheets";

const layout = getGostSheetLayout("A3", "SPDS");

const svg = renderGostSheetSvg({
  format: "A3",
  standard: "SPDS",
  meta: {
    designation: "ОВ1-СО",
    objectName: "Flow-модель",
    buildingName: "Отопление",
    drawingName: "Аксонометрическая схема системы отопления",
    organization: "Замоделька",
    stage: "Р",
    sheet: "1",
    sheets: "1",
    scale: "Авто",
  },
  content: `<g><!-- чертеж внутри layout.drawingArea --></g>`,
});

const sheet = createGostSheetTemplate("A1", "ESKD");
const anotherSvg = sheet.render({
  meta: { drawingName: "Схема" },
  content: `<g/>`,
});
```

## Правило использования

Модуль листов не должен знать про отопление, вентиляцию, ведомости систем или привязки. Он отвечает только за лист, рамку, основную надпись и координатные слоты. Предметная графика передается через `content`.
