# Инструкция для ИИ-агента: сборка фазы 0 (каркас веб-моделлера на That Open)

> **Кому.** Этот документ исполняет ИИ-агент (Claude / Qwen / Cursor / Cline). Человек читает для контроля.
> **Цель фазы 0.** Запустить пустую рабочую 3D-сцену That Open Engine в браузере + бэкенд с БД. Никакой вентиляции пока — только фундамент, который ГАРАНТИРОВАННО стартует.
> **Контекст.** Предыдущие попытки собрать That Open «с нуля по памяти» падали с ошибкой про `.wasm` / белым экраном. Причина — устаревший API в обучающих данных. Этот документ снимает корень проблемы.

---

## ⛔ КРИТИЧЕСКОЕ ПРАВИЛО №1 — не писать инициализацию по памяти

Твои знания об API That Open, скорее всего, **устарели**. Конкретно сломано в старых примерах:

- `setWasmPath("...")` + класть wasm в `public/` — **устаревший способ**.
- Инициализация Fragments без worker — **больше не работает** (нужен `FragmentsManager.getWorker()`).
- Импорты `web-ifc-viewer`, старые имена классов OBC — **частично удалены/переименованы**.

**Поэтому: не генерируй стартовый каркас из головы. Скаффолди официальным шаблоном (Шаг 1), он уже содержит корректные worker/wasm/vite-конфиг под текущие версии.** Только потом дописывай.

---

## ⛔ КРИТИЧЕСКОЕ ПРАВИЛО №2 — версии web-ifc должны совпадать

Версия `web-ifc` в URL загрузки WASM обязана **точно** совпадать с версией, которую тянет установленный `@thatopen/components`. Рассинхрон = падение бинарника.

После установки зависимостей **обязательно** выполни и запомни вывод:
```bash
npm ls web-ifc
```
Найденную версию (например `0.0.77`) подставляй везде, где указывается путь к WASM. Не хардкодь версию из этого документа — она пример.

---

## Шаг 1. Скаффолдинг официальным шаблоном

Не `npm create vite`, а официальный CLI That Open — он создаёт проект с уже рабочими worker/wasm/конфигом:

```bash
npm create bim-app@latest
```

Действия агента:
1. Запустить команду в пустой папке проекта.
2. Если предложит установить `create-bim-app` — согласиться.
3. В промптах выбрать: **Vanilla TypeScript + Vite** (без React, чтобы минимизировать слои на старте; React можно добавить в фазе 1, если решим).
4. Дождаться установки, затем:
```bash
cd <project-name>
npm install
npm run dev
```
5. **Контрольная точка A:** в браузере открывается пример That Open (обычно сцена с загруженной моделью или пустой мир). Если открылось без ошибок в консоли — фундамент жив, идём дальше. Если нет — см. раздел «Диагностика».

> Если CLI по какой-то причине недоступен — fallback: клонировать пример из репозитория `ThatOpen/engine_templates` или `ThatOpen/engine_components` (папка с рабочим `vite.config-examples.ts`). НЕ собирать конфиг руками с нуля.

---

## Шаг 2. Очистить до пустой сцены

Из сгенерированного примера убрать загрузку демо-модели, оставить только:
- инициализацию `OBC.Components`,
- создание мира (`world`): сцена + камера + рендерер,
- сетку/грид для ориентации,
- орбитальное управление камерой.

Целевой `src/main.ts` (адаптировать под фактический API из сгенерированного шаблона — НЕ слепо копировать, сверять с рабочим примером):

```ts
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front"; // если есть в шаблоне
import * as BUI from "@thatopen/ui";

const container = document.getElementById("app") as HTMLElement;

const components = new OBC.Components();

const worlds = components.get(OBC.Worlds);
const world = worlds.create();

world.scene = new OBC.SimpleScene(components);
world.renderer = new OBC.SimpleRenderer(components, container);
world.camera = new OBC.SimpleCamera(components);

components.init();

world.scene.setup();           // базовый свет
world.scene.three.background = null;

// сетка для ориентации
const grids = components.get(OBC.Grids);
grids.create(world);

// камера на стартовую позицию
world.camera.controls.setLookAt(12, 8, 12, 0, 0, 0);
```

> ⚠ Точные имена классов (`SimpleScene` и т.п.) могут отличаться в текущей версии. **Источник истины — сгенерированный шаблон и docs.thatopen.com, а не этот фрагмент.** Сверяй.

**Контрольная точка B:** в браузере — пустая сцена с сеткой, камера вращается мышью, консоль чистая.

---

## Шаг 3. Инициализировать Fragments + worker (правильно)

Это шаг, который раньше ломался. Worker обязателен:

```ts
const workerUrl = await OBC.FragmentsManager.getWorker(); // тянет worker нужной версии, возвращает blob-URL
const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl);

// связать обновление фрагментов с камерой (culling/LOD)
world.camera.controls.addEventListener("rest", () => fragments.update(true));
```

Если будем грузить IFC (фаза 1+), настройка лоадера с WASM по CDN:
```ts
const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: { path: "https://unpkg.com/web-ifc@<ВЕРСИЯ_ИЗ_npm_ls>/", absolute: true },
});
```

**Контрольная точка C:** `fragments.init` отработал без ошибок в консоли (нет ругани на worker/wasm).

---

## Шаг 4. Минимальный UI (@thatopen/ui)

```ts
BUI.Manager.init();
```
Добавить простой тулбар-заглушку (`bim-toolbar`, `bim-button`) с одной неактивной кнопкой «Воздуховод» — задел под фазу 1. Логики пока нет.

**Контрольная точка D:** тулбар виден поверх сцены.

---

## Шаг 5. Бэкенд + БД

Поднять отдельным сервисом (папка `/server`):

**Стек:** FastAPI (Python) + PostgreSQL. (Допустимо Node/Express, если агенту так надёжнее — согласовать.)

Минимальная схема БД:
```sql
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  version     INT  NOT NULL DEFAULT 1,
  units       TEXT NOT NULL DEFAULT 'mm',
  graph       JSONB NOT NULL DEFAULT '{"elements": []}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sortament (
  ref            TEXT PRIMARY KEY,
  shape          TEXT NOT NULL,        -- 'round' | 'rectangular'
  d              NUMERIC,              -- круглый, мм
  w              NUMERIC,              -- прямоугольный, мм
  h              NUMERIC,
  wall_thickness NUMERIC,
  mass_per_m     NUMERIC,
  source         TEXT                  -- 'ВСН 353-86' и т.п.
);
```

Минимальные эндпоинты:
| Метод | Путь | Назначение |
|-------|------|-----------|
| `POST` | `/projects` | создать проект |
| `GET` | `/projects/{id}` | получить граф |
| `PUT` | `/projects/{id}` | сохранить граф (JSONB) |
| `GET` | `/sortament?shape=round` | список типоразмеров |

Залить стартовый сортамент (хотя бы 5–6 круглых ⌀100…⌀400 и пару прямоугольных) из ВСН 353-86 как seed.

**Контрольная точка E:** `POST /projects` создаёт запись, `GET /sortament` возвращает список. Проверить curl-ом.

---

## Шаг 6. Связать фронт с бэком

В сцене: кнопка «Сохранить» → `PUT /projects/{id}` с текущим графом (пока `{"elements": []}`); «Загрузить» → `GET` и восстановление (пока пустого) графа.

**Контрольная точка F (= конец фазы 0):**
полный цикл — открыл приложение → пустая сцена с сеткой и тулбаром → сохранил проект на бэкенд → перезагрузил страницу → загрузил проект. Ошибок в консоли нет.

---

## Диагностика (если что-то падает)

| Симптом | Причина | Что делать |
|---------|---------|-----------|
| Белый экран, ошибка про `.wasm` | рассинхрон версий web-ifc / неверный путь | `npm ls web-ifc`, подставить точную версию в путь WASM |
| Ошибка про worker / Fragments не init | пропущен `getWorker()` | добавить Шаг 3 целиком |
| `top-level await` ошибка сборки | vite-конфиг шаблона не подхватился | убедиться, что работаешь в скаффолженном проекте, а не в голом `npm create vite` |
| `Cannot find module @thatopen/...` | неполная установка | удалить `node_modules` + `package-lock.json`, `npm install` заново |
| Класс/метод не найден | устаревший API из памяти | свериться с docs.thatopen.com и кодом примера в шаблоне, НЕ изобретать |

---

## Жёсткие правила для агента (повторение — намеренное)

1. **Не писать init по памяти.** Скаффолдить `npm create bim-app@latest`, дописывать поверх рабочего.
2. **Версия web-ifc в пути WASM = вывод `npm ls web-ifc`.** Не хардкодить из примера.
3. **Fragments только с worker** (`getWorker()`).
4. **Источник истины по API — сгенерированный шаблон + docs.thatopen.com**, а не обучающие данные.
5. **Геометрию (в след. фазах) строить через web-ifc/Clay**, не голыми three.js-мешами — иначе сломается экспорт IFC.
6. **MIT-чистота:** не добавлять GPL-зависимости.
7. **После каждого шага — проверять контрольную точку** прежде чем идти дальше. Не двигаться вперёд по сломанному фундаменту.
8. **Не менять чужой код без спроса.** Завершив фазу 0, остановиться и отчитаться человеку.

---

## Definition of Done — фаза 0

- [ ] `npm run dev` стартует без ошибок в консоли.
- [ ] В браузере: пустая 3D-сцена, сетка, вращение камеры мышью.
- [ ] Fragments инициализирован с worker (Шаг 3) без ошибок.
- [ ] Тулбар-заглушка с кнопкой «Воздуховод» виден.
- [ ] Бэкенд: `POST/GET/PUT /projects` и `GET /sortament` работают.
- [ ] Цикл сохранить→перезагрузить→загрузить проходит.
- [ ] Зафиксированы фактические версии пакетов (`package.json`) и вывод `npm ls web-ifc` в README проекта.

> Выполнив всё — переходить к фазе 1 (рисование воздуховодов) из основного MVP-плана. Не раньше.

---

*Источники: официальный CLI `npm create bim-app@latest` (ThatOpen/engine_templates), docs.thatopen.com (IfcLoader / FragmentsManager init с worker). Лицензия ядра — MIT.*
