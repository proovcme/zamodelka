import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import { appIcons, tooltips } from "../../globals";
import { IfcExporter } from "../../bim-components/IfcExporter";

export interface ViewerToolbarState {
  components: OBC.Components;
  world: OBC.World;
}

const originalColors = new Map<
  FRAGS.BIMMaterial,
  { color: number; transparent: boolean; opacity: number }
>();

(window as any).isGhostModeActive = false;

const setModelTransparent = (components: OBC.Components) => {
  if (!components) return;
  const fragments = components.get(OBC.FragmentsManager);

  const materials = [...fragments.core.models.materials.list.values()];
  for (const material of materials) {
    if (material.userData.customId) continue;
    let color: number | undefined;
    if ("color" in material) {
      color = material.color.getHex();
    } else {
      color = material.lodColor.getHex();
    }

    originalColors.set(material, {
      color,
      transparent: material.transparent,
      opacity: material.opacity,
    });

    material.transparent = true;
    material.opacity = 0.25; // Полупрозрачность 0.2-0.3
    material.needsUpdate = true;
    if ("color" in material) {
      material.color.setHex(0x888888); // Серый цвет
    } else {
      material.lodColor.setHex(0x888888); // Серый цвет
    }
  }
  fragments.core.update(true);
};

const restoreModelMaterials = (components: OBC.Components) => {
  for (const [material, data] of originalColors) {
    const { color, transparent, opacity } = data;
    material.transparent = transparent;
    material.opacity = opacity;
    if ("color" in material) {
      material.color.setHex(color);
    } else {
      material.lodColor.setHex(color);
    }
    material.needsUpdate = true;
  }
  originalColors.clear();
  if (components) {
    const fragments = components.get(OBC.FragmentsManager);
    fragments.core.update(true);
  }
};

(window as any).toggleGhostMode = (active?: boolean) => {
  const comp = (window as any).globalComponents;
  if (!comp) return;

  const shouldActivate = active !== undefined ? active : !(window as any).isGhostModeActive;
  if (shouldActivate) {
    if (!(window as any).isGhostModeActive) {
      setModelTransparent(comp);
      (window as any).isGhostModeActive = true;
    }
  } else {
    if ((window as any).isGhostModeActive) {
      restoreModelMaterials(comp);
      (window as any).isGhostModeActive = false;
    }
  }
  window.dispatchEvent(new CustomEvent("ghost-mode-changed"));
};


// Хранилище сортамента и состояния выбора
let sortamentList: any[] = [];
let selectedShape: "round" | "rectangular" = "round";
let selectedRef = "VSN353-R-200";
let currentElevation = 0; // глобальная отметка черчения/размещения, мм

// Состояние черчения стен и привязок
let selectedWallHeight = 3000;      // мм
let selectedWallThickness = 200;    // мм
let selectedWallMaterial = "brick"; // brick | concrete | gypsum
let selectedAngleStep = 5;          // градусы

// Состояние черчения лотков
let selectedTrayWidth = 200;          // мм
let selectedTrayHeight = 80;          // мм
let selectedTrayKind: "solid" | "perforated" | "ladder" = "solid";
let selectedTrayRef = "TRAY-200x80";

// Состояние черчения труб
let selectedPipeDiameter = 25;        // мм
let selectedPipeMaterial: "steel_water" | "ppr" = "steel_water";
let selectedPipeRef = "PIPE-25";

// Состояние черчения воздуховодов
let selectedDuctSystem = "Приточный";

// Состояние черчения труб
let selectedPipeSystem = "ХВС";

const DEFAULT_SORTAMENT: any[] = [
  // Round ducts (ВСН 353-86)
  { ref: "VSN353-R-100", shape: "round", d: 100.0, wall_thickness: 0.5, mass_per_m: 1.2, source: "ВСН 353-86" },
  { ref: "VSN353-R-125", shape: "round", d: 125.0, wall_thickness: 0.5, mass_per_m: 1.5, source: "ВСН 353-86" },
  { ref: "VSN353-R-160", shape: "round", d: 160.0, wall_thickness: 0.5, mass_per_m: 1.9, source: "ВСН 353-86" },
  { ref: "VSN353-R-200", shape: "round", d: 200.0, wall_thickness: 0.5, mass_per_m: 2.4, source: "ВСН 353-86" },
  { ref: "VSN353-R-250", shape: "round", d: 250.0, wall_thickness: 0.5, mass_per_m: 3.1, source: "ВСН 353-86" },
  { ref: "VSN353-R-315", shape: "round", d: 315.0, wall_thickness: 0.5, mass_per_m: 3.9, source: "ВСН 353-86" },
  { ref: "VSN353-R-400", shape: "round", d: 400.0, wall_thickness: 0.5, mass_per_m: 4.9, source: "ВСН 353-86" },
  
  // Rectangular ducts (ВСН 353-86)
  { ref: "VSN353-REC-150x100", shape: "rectangular", w: 150.0, h: 100.0, wall_thickness: 0.5, mass_per_m: 2.0, source: "ВСН 353-86" },
  { ref: "VSN353-REC-200x150", shape: "rectangular", w: 200.0, h: 150.0, wall_thickness: 0.5, mass_per_m: 2.8, source: "ВСН 353-86" },
  { ref: "VSN353-REC-250x200", shape: "rectangular", w: 250.0, h: 200.0, wall_thickness: 0.5, mass_per_m: 3.5, source: "ВСН 353-86" },
  { ref: "VSN353-REC-400x250", shape: "rectangular", w: 400.0, h: 250.0, wall_thickness: 0.6, mass_per_m: 6.1, source: "ВСН 353-86" },
  
  // Trays
  { ref: "TRAY-100x50", shape: "tray", w: 100.0, h: 50.0, wall_thickness: 1.0, mass_per_m: 1.1, source: "Сортамент лотков" },
  { ref: "TRAY-200x80", shape: "tray", w: 200.0, h: 80.0, wall_thickness: 1.2, mass_per_m: 1.8, source: "Сортамент лотков" },
  { ref: "TRAY-300x100", shape: "tray", w: 300.0, h: 100.0, wall_thickness: 1.5, mass_per_m: 2.7, source: "Сортамент лотков" },
  { ref: "TRAY-400x100", shape: "tray", w: 400.0, h: 100.0, wall_thickness: 1.5, mass_per_m: 3.5, source: "Сортамент лотков" },

  // Pipes
  { ref: "PIPE-15", shape: "pipe", d: 15.0, wall_thickness: 2.5, mass_per_m: 1.2, source: "ГОСТ 3262-75" },
  { ref: "PIPE-20", shape: "pipe", d: 20.0, wall_thickness: 2.8, mass_per_m: 1.7, source: "ГОСТ 3262-75" },
  { ref: "PIPE-25", shape: "pipe", d: 25.0, wall_thickness: 3.2, mass_per_m: 2.4, source: "ГОСТ 3262-75" },
  { ref: "PIPE-32", shape: "pipe", d: 32.0, wall_thickness: 3.2, mass_per_m: 3.1, source: "ГОСТ 3262-75" },
  { ref: "PIPE-40", shape: "pipe", d: 40.0, wall_thickness: 3.5, mass_per_m: 3.8, source: "ГОСТ 3262-75" },
  { ref: "PIPE-50", shape: "pipe", d: 50.0, wall_thickness: 3.5, mass_per_m: 4.9, source: "ГОСТ 3262-75" },
  { ref: "PIPE-80", shape: "pipe", d: 80.0, wall_thickness: 4.0, mass_per_m: 8.4, source: "ГОСТ 3262-75" },
  { ref: "PIPE-100", shape: "pipe", d: 100.0, wall_thickness: 4.5, mass_per_m: 11.6, source: "ГОСТ 3262-75" }
];

const getApiUrl = (path: string): string => {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const base = isLocal ? "http://127.0.0.1:8000" : (window.location.origin + "/api");
  return `${base}${path}`;
};

const loadSortament = async (callback: () => void) => {
  try {
    const res = await fetch(getApiUrl("/sortament"));
    if (res.ok) {
      sortamentList = await res.json();
      console.log("Sortament loaded from API:", sortamentList);
    } else {
      console.warn("Failed to fetch sortament from API, using default static sortament.");
      sortamentList = DEFAULT_SORTAMENT;
    }
  } catch (err) {
    console.warn("Network error fetching sortament, using default static sortament:", err);
    sortamentList = DEFAULT_SORTAMENT;
  }

  if ((window as any).drawingSettings) {
    (window as any).drawingSettings.sortamentList = sortamentList;
  }
  
  // Выбираем первый элемент по умолчанию
  const roundItems = sortamentList.filter(item => item.shape === "round");
  if (roundItems.length > 0) {
    selectedRef = roundItems[0].ref;
  }
  
  const trayItems = sortamentList.filter(item => item.shape === "tray");
  if (trayItems.length > 0) {
    selectedTrayRef = trayItems[0].ref;
    selectedTrayWidth = trayItems[0].w;
    selectedTrayHeight = trayItems[0].h;
  }
  
  const pipeItems = sortamentList.filter(item => item.shape === "pipe");
  if (pipeItems.length > 0) {
    selectedPipeRef = pipeItems[0].ref;
    selectedPipeDiameter = pipeItems[0].d;
  }
  
  callback();
};

let currentProjectId = localStorage.getItem("vent_mvp_project_id") || "";

const ensureProjectExists = async () => {
  if (!currentProjectId) {
    try {
      const res = await fetch(getApiUrl("/projects"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Новый проект вентиляции" }),
      });
      if (res.ok) {
        const data = await res.json();
        currentProjectId = data.id;
        localStorage.setItem("vent_mvp_project_id", currentProjectId);
        console.log("Created project on backend with ID:", currentProjectId);
      } else {
        throw new Error("Failed to create project on API backend");
      }
    } catch (err) {
      console.warn("Failed to create project on backend, using local project storage:", err);
      currentProjectId = "local-project-id";
      localStorage.setItem("vent_mvp_project_id", currentProjectId);
    }
  }
};

ensureProjectExists();

export const viewerToolbarTemplate: BUI.StatefullComponent<
  ViewerToolbarState
> = (state, update) => {
  const { components, world } = state;

  // Функция сохранения текущего состояния в глобальный window.drawingSettings
  const syncGlobalsToWindow = () => {
    (window as any).drawingSettings = {
      sortamentList,
      selectedShape,
      selectedRef,
      currentElevation,
      selectedWallHeight,
      selectedWallThickness,
      selectedWallMaterial,
      selectedAngleStep,
      selectedTrayWidth,
      selectedTrayHeight,
      selectedTrayKind,
      selectedTrayRef,
      selectedPipeDiameter,
      selectedPipeMaterial,
      selectedPipeRef,
      selectedDuctSystem,
      selectedPipeSystem,
    };
  };

  // Инициализируем настройки при первой отрисовке
  if (!(window as any).drawingSettings) {
    syncGlobalsToWindow();
  }

  // Слушаем изменения настроек черчения из диспетчера (models.ts)
  const settingsSyncListener = "__drawingSettingsSyncListener";
  if ((window as any)[settingsSyncListener]) {
    window.removeEventListener("drawing-settings-updated", (window as any)[settingsSyncListener]);
  }
  (window as any)[settingsSyncListener] = (e: CustomEvent) => {
    const { key, value } = e.detail;
    if (key === "selectedShape") {
      selectedShape = value;
      // При изменении формы воздуховода переключаем дефолтный ref
      const filtered = sortamentList.filter(item => item.shape === selectedShape);
      if (filtered.length > 0) {
        selectedRef = filtered[0].ref;
      }
      syncParamsToTool();
    }
    else if (key === "selectedRef") { selectedRef = value; syncParamsToTool(); }
    else if (key === "currentElevation") { currentElevation = value; applyElevationToTools(); }
    else if (key === "selectedWallHeight") { selectedWallHeight = value; syncWallParamsToTool(); }
    else if (key === "selectedWallThickness") { selectedWallThickness = value; syncWallParamsToTool(); }
    else if (key === "selectedWallMaterial") { selectedWallMaterial = value; syncWallParamsToTool(); }
    else if (key === "selectedAngleStep") {
      selectedAngleStep = value;
      syncParamsToTool();
      syncWallParamsToTool();
      syncTrayParamsToTool();
      syncPipeParamsToTool();
    }
    else if (key === "selectedTrayRef") {
      selectedTrayRef = value;
      const item = sortamentList.find(i => i.ref === selectedTrayRef);
      if (item) {
        selectedTrayWidth = item.w;
        selectedTrayHeight = item.h;
      }
      syncTrayParamsToTool();
    }
    else if (key === "selectedPipeRef") {
      selectedPipeRef = value;
      const item = sortamentList.find(i => i.ref === selectedPipeRef);
      if (item) {
        selectedPipeDiameter = item.d;
      }
      syncPipeParamsToTool();
    }
    else if (key === "selectedPipeMaterial") { selectedPipeMaterial = value; syncPipeParamsToTool(); }
    else if (key === "selectedPipeSystem") { selectedPipeSystem = value; syncPipeParamsToTool(); }
    else if (key === "selectedDuctSystem") { selectedDuctSystem = value; syncParamsToTool(); }
    
    syncGlobalsToWindow();
    update();
  };
  window.addEventListener("drawing-settings-updated", (window as any)[settingsSyncListener]);
  
  // Обновляем состояние кнопок при сбросе инструментов по правой кнопке мыши
  const listenerName = "__toolDeactivatedListener";
  if ((window as any)[listenerName]) {
    window.removeEventListener("tool-deactivated", (window as any)[listenerName]);
  }
  (window as any)[listenerName] = () => {
    syncGlobalsToWindow();
    update();
  };
  window.addEventListener("tool-deactivated", (window as any)[listenerName]);

  const radiatorConnectListenerName = "__radiatorConnectToolbarListener";
  if ((window as any)[radiatorConnectListenerName]) {
    window.removeEventListener("radiator-connect-changed", (window as any)[radiatorConnectListenerName]);
    window.removeEventListener("radiator-connect-started", (window as any)[radiatorConnectListenerName]);
    window.removeEventListener("radiator-connect-cancelled", (window as any)[radiatorConnectListenerName]);
  }
  (window as any)[radiatorConnectListenerName] = () => update();
  window.addEventListener("radiator-connect-changed", (window as any)[radiatorConnectListenerName]);
  window.addEventListener("radiator-connect-started", (window as any)[radiatorConnectListenerName]);
  window.addEventListener("radiator-connect-cancelled", (window as any)[radiatorConnectListenerName]);

  const flowModeListenerName = "__flowModeToolbarListener";
  if ((window as any)[flowModeListenerName]) {
    window.removeEventListener("flow-state-changed", (window as any)[flowModeListenerName]);
    window.removeEventListener("flow-discipline-enter", (window as any)[flowModeListenerName]);
    window.removeEventListener("flow-discipline-exit", (window as any)[flowModeListenerName]);
  }
  (window as any)[flowModeListenerName] = () => update();
  window.addEventListener("flow-state-changed", (window as any)[flowModeListenerName]);
  window.addEventListener("flow-discipline-enter", (window as any)[flowModeListenerName]);
  window.addEventListener("flow-discipline-exit", (window as any)[flowModeListenerName]);
  
  // Обновляем состояние кнопки свойств при закрытии панели изнутри
  const panelToggleListener = "__propertiesPanelToggleListener";
  if ((window as any)[panelToggleListener]) {
    window.removeEventListener("properties-panel-toggle", (window as any)[panelToggleListener]);
  }
  (window as any)[panelToggleListener] = () => update();
  window.addEventListener("properties-panel-toggle", (window as any)[panelToggleListener]);

  // Синхронизируем параметры при привязке черчения к существующей трассе
  const syncListenerName = "__toolParamsSyncListener";
  if ((window as any)[syncListenerName]) {
    window.removeEventListener("tool-params-sync", (window as any)[syncListenerName]);
  }
  (window as any)[syncListenerName] = (e: CustomEvent) => {
    const detail = e.detail;
    if (detail.elevation !== undefined) {
      currentElevation = detail.elevation;
      applyElevationToTools();
    }
    
    if (detail.toolType === "duct") {
      selectedShape = detail.shape;
      selectedRef = detail.sortamentRef;
      if (detail.system) {
        selectedDuctSystem = detail.system;
      }
      syncParamsToTool();
    } else if (detail.toolType === "tray") {
      selectedTrayWidth = detail.width;
      selectedTrayHeight = detail.height;
      selectedTrayKind = detail.kind;
      selectedTrayRef = detail.sortamentRef;
      syncTrayParamsToTool();
    } else if (detail.toolType === "pipe") {
      selectedPipeDiameter = detail.d;
      selectedPipeMaterial = detail.material;
      selectedPipeRef = detail.sortamentRef;
      syncPipeParamsToTool();
    }
    
    syncGlobalsToWindow();
    // Оповещаем диспетчер, что параметры были синхронизированы из 3D
    window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
    update();
  };
  window.addEventListener("tool-params-sync", (window as any)[syncListenerName]);

  // Всегда держим window.drawingSettings актуальным на каждый рендер
  syncGlobalsToWindow();

  const highlighter = components.get(OBF.Highlighter);
  const hider = components.get(OBC.Hider);

  // Загружаем сортамент при первой отрисовке, если он пуст
  if (sortamentList.length === 0) {
    loadSortament(update);
  }

  const onSaveProject = async ({ target }: { target: BUI.Button }) => {
    await ensureProjectExists();
    if (!currentProjectId) {
      alert("Не удалось инициализировать проект.");
      return;
    }
    target.loading = true;
    const tool = (window as any).ductDrawingTool;
    const graphData = { elements: tool ? tool.projectElements : [] };

    // Save to localStorage as a robust local backup
    try {
      localStorage.setItem(`vent_mvp_project_data_${currentProjectId}`, JSON.stringify(graphData));
      console.log("Saved project data locally in localStorage:", currentProjectId);
    } catch (localErr) {
      console.error("Failed to save to localStorage:", localErr);
    }

    try {
      const res = await fetch(getApiUrl(`/projects/${currentProjectId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: graphData }),
      });
      if (res.ok) {
        alert(`Проект сохранен в облаке и локально. ID: ${currentProjectId}`);
      } else {
        console.warn("API save failed, saved locally only.");
        alert(`Проект сохранен локально (ошибка сервера). ID: ${currentProjectId}`);
      }
    } catch (err) {
      console.warn("Network error saving to backend, saved locally only:", err);
      alert(`Проект сохранен локально (нет соединения). ID: ${currentProjectId}`);
    } finally {
      target.loading = false;
    }
  };

  const onLoadProject = async ({ target }: { target: BUI.Button }) => {
    if (!currentProjectId) {
      alert("Сохраненный проект отсутствует.");
      return;
    }
    target.loading = true;
    let loadedElements: any[] | null = null;
    let projectName = "Локальный проект";
    let projectVersion = 1;

    try {
      const res = await fetch(getApiUrl(`/projects/${currentProjectId}`));
      if (res.ok) {
        const data = await res.json();
        loadedElements = data.graph.elements || [];
        projectName = data.name || projectName;
        projectVersion = data.version || projectVersion;
        console.log("Loaded project from backend:", currentProjectId);
      }
    } catch (err) {
      console.warn("Failed to fetch project from backend, trying localStorage:", err);
    }

    if (!loadedElements) {
      try {
        const localDataStr = localStorage.getItem(`vent_mvp_project_data_${currentProjectId}`);
        if (localDataStr) {
          const localData = JSON.parse(localDataStr);
          loadedElements = localData.elements || [];
          console.log("Loaded project from localStorage:", currentProjectId);
        }
      } catch (localErr) {
        console.error("Error reading project from localStorage:", localErr);
      }
    }

    if (loadedElements) {
      const ductTool = (window as any).ductDrawingTool;
      if (ductTool) {
        const tools = [
          ductTool,
          (window as any).wallDrawingTool,
          (window as any).terminalPlacementTool,
          (window as any).equipmentPlacementTool,
          (window as any).trayDrawingTool,
          (window as any).pipeDrawingTool,
          (window as any).electricalPlacementTool
        ];
        tools.forEach(t => {
          if (t) t.projectElements = loadedElements;
        });
        ductTool.renderAll(loadedElements);
      }
      alert(`Проект загружен. Элементов: ${loadedElements.length}`);
    } else {
      alert("Не удалось найти сохраненный проект ни в облаке, ни локально.");
    }
    target.loading = false;
  };

  const onExportExcel = () => {
    if (!currentProjectId) {
      alert("Сначала сохраните проект!");
      return;
    }
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (isLocal) {
      window.open(getApiUrl(`/projects/${currentProjectId}/export/xlsx`), "_blank");
    } else {
      alert("Экспорт в Excel временно недоступен в веб-версии без запущенного бэкенда. Пожалуйста, используйте экспорт в IFC.");
    }
  };

  const onExportIfc = () => {
    const tool = (window as any).ductDrawingTool;
    if (!tool || tool.projectElements.length === 0) {
      alert("Проект пуст, нечего экспортировать!");
      return;
    }
    
    const ifcContent = IfcExporter.exportToIfc(tool.projectElements, "Вентиляция MVP");
    const blob = new Blob([ifcContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `model_${currentProjectId || "project"}.ifc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onToggleGhost = () => {
    (window as any).toggleGhostMode();
    update();
  };

  const onExportRevit = () => {
    const tool = (window as any).ductDrawingTool;
    if (!tool) {
      alert("Инструмент черчения не найден!");
      return;
    }
    const elements = tool.projectElements || [];

    const levelsList = (window as any).projectLevels || { "Уровень пола": 0 };
    const levels = Object.entries(levelsList).map(([name, val]) => ({
      name,
      elevation: Number(val)
    }));

    const systemsList = (window as any).systemColorSettings || { "Приточный": "синий" };
    const systems = Object.keys(systemsList).map((name) => {
      let domain = "HVAC";
      if (["ХВС", "ГВС", "Канализация"].includes(name)) {
        domain = "Plumbing";
      } else if (name === "Кабель-канал") {
        domain = "Electrical";
      }
      return { name, domain };
    });

    const getClosestLevel = (yMm: number) => {
      let closestName = "Уровень пола";
      let minDiff = Infinity;
      for (const lvl of levels) {
        const diff = Math.abs(yMm - lvl.elevation);
        if (diff < minDiff) {
          minDiff = diff;
          closestName = lvl.name;
        }
      }
      return closestName;
    };

    const formattedElements = elements.map((elem: any) => {
      const base: any = {
        id: elem.id,
        type: elem.type,
      };

      let yCoord = 0;
      if (elem.start && Array.isArray(elem.start)) {
        yCoord = elem.start[1];
      } else if (elem.position && Array.isArray(elem.position)) {
        yCoord = elem.position[1];
      }
      base.level = getClosestLevel(yCoord);

      if (elem.start && elem.end && Array.isArray(elem.start) && Array.isArray(elem.end)) {
        base.start = [elem.start[0], elem.start[1], elem.start[2]];
        base.end = [elem.end[0], elem.end[1], elem.end[2]];
      }

      if (elem.position && Array.isArray(elem.position)) {
        base.position = [elem.position[0], elem.position[1], elem.position[2]];
      }

      if (elem.type === "duct") {
        base.shape = elem.shape || "round";
        base.system = elem.system || "Приточный";
        if (base.shape === "round") {
          base.size = { d: elem.size?.d || 200 };
        } else {
          base.size = { w: elem.size?.w || 200, h: elem.size?.h || 200 };
        }
      } 
      else if (elem.type === "pipe") {
        base.system = elem.system || "ХВС";
        base.material = elem.material || "steel_water";
        base.size = { d: elem.diameter || 25 };
      } 
      else if (elem.type === "tray") {
        base.kind = elem.kind || "solid";
        base.size = { w: elem.width || 200, h: elem.height || 80 };
      } 
      else if (elem.type === "wall") {
        base.height = elem.height || 3000;
        base.thickness = elem.thickness || 200;
        base.material = elem.material || "brick";
      } 
      else if (elem.type === "fitting") {
        base.fittingType = elem.fittingType || "elbow";
        base.shape = elem.shape || "round";
        base.size = elem.size || {};
        base.system = elem.system;
      } 
      else {
        if (elem.width !== undefined) base.width = elem.width;
        if (elem.height !== undefined) base.height = elem.height;
        if (elem.hostWallId !== undefined) base.hostWallId = elem.hostWallId;
        if (elem.ref !== undefined) base.ref = elem.ref;
        if (elem.system !== undefined) base.system = elem.system;
        if (elem.text !== undefined) base.text = elem.text;
        if (elem.author !== undefined) base.author = elem.author;
        if (elem.createdAt !== undefined) base.createdAt = elem.createdAt;
      }

      return base;
    });

    const revitProject = {
      units: "mm",
      levels,
      systems,
      elements: formattedElements
    };

    const blob = new Blob([JSON.stringify(revitProject, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revit_project_${currentProjectId || "export"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Деактивация всех инструментов для предотвращения конфликтов
  const deactivateAllTools = () => {
    window.dispatchEvent(new CustomEvent("radiator-connect-stop"));
    (window as any).ductDrawingTool?.deactivate();
    (window as any).wallDrawingTool?.deactivate();
    (window as any).terminalPlacementTool?.deactivate();
    (window as any).equipmentPlacementTool?.deactivate();
    (window as any).trayDrawingTool?.deactivate();
    (window as any).pipeDrawingTool?.deactivate();
    (window as any).electricalPlacementTool?.deactivate();
    (window as any).accessoryPlacementTool?.deactivate();
    (window as any).twoPipeDrawingTool?.deactivate();
  };

  // Режим расстановки пометок (аннотаций) — видимая кнопка в тулбаре
  const onToggleNoteTool = () => {
    const active = !(window as any).notePlacementActive;
    if (active) deactivateAllTools();
    (window as any).notePlacementActive = active;
    const vp = document.querySelector("bim-viewport") as HTMLElement | null;
    if (vp) vp.style.cursor = active ? "crosshair" : "default";
    window.dispatchEvent(new CustomEvent("note-mode-changed"));
    update();
  };

  // Проброс текущей отметки во все инструменты, использующие плоскость черчения
  const applyElevationToTools = () => {
    (window as any).ductDrawingTool?.setElevation?.(currentElevation);
    (window as any).wallDrawingTool?.setElevation?.(currentElevation);
    (window as any).equipmentPlacementTool?.setElevation?.(currentElevation);
    (window as any).trayDrawingTool?.setElevation?.(currentElevation);
    (window as any).pipeDrawingTool?.setElevation?.(currentElevation);
    (window as any).electricalPlacementTool?.setElevation?.(currentElevation);
    (window as any).terminalPlacementTool?.setElevation?.(currentElevation);
    (window as any).accessoryPlacementTool?.setElevation?.(currentElevation);
    (window as any).twoPipeDrawingTool?.setElevation?.(currentElevation);
  };


  // Переключение состояния инструмента черчения стены
  const onToggleWallTool = () => {
    const tool = (window as any).wallDrawingTool;
    if (tool) {
      if (tool.enabled) {
        tool.deactivate();
      } else {
        deactivateAllTools();
        syncWallParamsToTool();
        applyElevationToTools();
        tool.activate();
      }
      update();
    }
  };

  const syncWallParamsToTool = () => {
    const tool = (window as any).wallDrawingTool;
    if (!tool) return;
    tool.activeParams.height = selectedWallHeight;
    tool.activeParams.thickness = selectedWallThickness;
    tool.activeParams.material = selectedWallMaterial;
    tool.setSnappingSettings({ angleStepDeg: selectedAngleStep });

    const ductTool = (window as any).ductDrawingTool;
    if (ductTool) {
      ductTool.setSnappingSettings({ angleStepDeg: selectedAngleStep });
    }
  };


  // Слушаем события изменения уровней
  const levelsListenerName = "__projectLevelsSyncListener";
  if ((window as any)[levelsListenerName]) {
    window.removeEventListener("project-levels-updated", (window as any)[levelsListenerName]);
  }
  (window as any)[levelsListenerName] = () => update();
  window.addEventListener("project-levels-updated", (window as any)[levelsListenerName]);

  // Синхронизация подсветки кнопки «Пометка» (гаснет после установки/смены режима)
  const noteModeListener = "__noteModeSyncListener";
  if ((window as any)[noteModeListener]) {
    window.removeEventListener("note-mode-changed", (window as any)[noteModeListener]);
    window.removeEventListener("project-notes-updated", (window as any)[noteModeListener]);
  }
  (window as any)[noteModeListener] = () => update();
  window.addEventListener("note-mode-changed", (window as any)[noteModeListener]);
  window.addEventListener("project-notes-updated", (window as any)[noteModeListener]);

  // Слушаем события изменения отметки (например, клик по уровню в Диспетчере проекта)
  const elevListenerName = "__globalElevationSyncListener";
  if ((window as any)[elevListenerName]) {
    window.removeEventListener("elevation-updated", (window as any)[elevListenerName]);
  }
  (window as any)[elevListenerName] = (e: CustomEvent) => {
    if (e.detail && e.detail.elevation !== undefined) {
      currentElevation = e.detail.elevation;
      applyElevationToTools();
      update();
    }
  };
  window.addEventListener("elevation-updated", (window as any)[elevListenerName]);

  // Слушаем изменения систем вентиляции (для обновления выпадающего списка)
  const sysListenerName = "__projectSystemsSyncListenerInToolbar";
  if ((window as any)[sysListenerName]) {
    window.removeEventListener("project-systems-updated", (window as any)[sysListenerName]);
  }
  (window as any)[sysListenerName] = () => update();
  window.addEventListener("project-systems-updated", (window as any)[sysListenerName]);

  // Слушаем событие: терминал размещён и ожидает выбора воздуховода
  const terminalConnectListenerName = "__terminalAwaitingConnectListener";
  if ((window as any)[terminalConnectListenerName]) {
    window.removeEventListener("terminal-placed-awaiting-connect", (window as any)[terminalConnectListenerName]);
    window.removeEventListener("terminal-connect-cancelled", (window as any)[terminalConnectListenerName]);
  }
  (window as any)[terminalConnectListenerName] = () => update();
  window.addEventListener("terminal-placed-awaiting-connect", (window as any)[terminalConnectListenerName]);
  window.addEventListener("terminal-connect-cancelled", (window as any)[terminalConnectListenerName]);


  // Переключение состояния инструмента черчения кабельного лотка
  const onToggleTrayTool = () => {
    const tool = (window as any).trayDrawingTool;
    if (tool) {
      if (tool.enabled) {
        tool.deactivate();
      } else {
        deactivateAllTools();
        syncTrayParamsToTool();
        applyElevationToTools();
        tool.activate();
      }
      update();
    }
  };

  const syncTrayParamsToTool = () => {
    const tool = (window as any).trayDrawingTool;
    if (!tool) return;

    const item = sortamentList.find(i => i.ref === selectedTrayRef);
    if (!item) return;

    tool.activeParams.width = selectedTrayWidth;
    tool.activeParams.height = selectedTrayHeight;
    tool.activeParams.kind = selectedTrayKind;
    tool.activeParams.sortamentRef = selectedTrayRef;
    tool.setSnappingSettings({ angleStepDeg: selectedAngleStep });
  };

  // Переключение состояния инструмента черчения трубопровода
  const onTogglePipeTool = () => {
    const tool = (window as any).pipeDrawingTool;
    if (tool) {
      if (tool.enabled) {
        tool.deactivate();
      } else {
        deactivateAllTools();
        syncPipeParamsToTool();
        applyElevationToTools();
        tool.activate();
      }
      update();
    }
  };

  const syncPipeParamsToTool = () => {
    const tool = (window as any).pipeDrawingTool;
    if (!tool) return;

    const item = sortamentList.find(i => i.ref === selectedPipeRef);
    if (!item) return;

    tool.activeParams.d = selectedPipeDiameter;
    tool.activeParams.material = selectedPipeMaterial;
    tool.activeParams.system = selectedPipeSystem;
    tool.activeParams.sortamentRef = selectedPipeRef;
    tool.setSnappingSettings({ angleStepDeg: selectedAngleStep });
  };


  // Переключение состояния инструмента черчения воздуховода
  const onToggleDuctTool = () => {
    const tool = (window as any).ductDrawingTool;
    if (tool) {
      if (tool.enabled) {
        tool.deactivate();
      } else {
        deactivateAllTools();
        syncParamsToTool();
        applyElevationToTools();
        tool.activate();
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения решетки
  const onToggleGrilleTool = () => {
    const tool = (window as any).terminalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "grille") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        tool.activate("grille");
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения диффузора
  const onToggleDiffuserTool = () => {
    const tool = (window as any).terminalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "diffuser") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        tool.activate("diffuser");
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения оборудования
  const onToggleEquipmentTool = () => {
    const tool = (window as any).equipmentPlacementTool;
    if (tool) {
      if (tool.enabled) {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate();
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения розеток
  const onToggleSocketTool = () => {
    const tool = (window as any).electricalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "socket") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate("socket");
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения распределительных щитов
  const onTogglePanelTool = () => {
    const tool = (window as any).electricalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "panel") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate("panel");
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения светильников
  const onToggleLightTool = () => {
    const tool = (window as any).electricalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "light") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate("light");
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения дверей
  const onToggleDoorTool = () => {
    const tool = (window as any).electricalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "door") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate("door");
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения окон
  const onToggleWindowTool = () => {
    const tool = (window as any).electricalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "window") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate("window");
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения колонн
  const onToggleColumnTool = () => {
    const tool = (window as any).electricalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "column") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate("column");
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения кондиционеров
  const onToggleACTool = () => {
    const tool = (window as any).electricalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "ac") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate("ac");
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения потолочных кондиционеров
  const onToggleACCeilingTool = () => {
    const tool = (window as any).electricalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "ac_ceiling") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate("ac_ceiling");
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения радиаторов
  const onToggleRadiatorTool = () => {
    const tool = (window as any).electricalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "radiator") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate("radiator");
      }
      update();
    }
  };

  const onToggleRadiatorConnectTool = () => {
    if ((window as any).__radiatorConnectToolActive) {
      window.dispatchEvent(new CustomEvent("radiator-connect-stop"));
    } else {
      deactivateAllTools();
      window.dispatchEvent(new CustomEvent("radiator-connect-toggle"));
    }
    update();
  };

  // Переключение состояния инструмента размещения арматуры ОВ/ВК
  const onToggleAccessoryTool = (kind: any) => {
    const tool = (window as any).accessoryPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === kind) {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate(kind);
      }
      update();
    }
  };

  // Переключение состояния инструмента двухтрубного черчения трубопроводов
  const onToggleTwoPipeTool = (type: "heating" | "cooling") => {
    const tool = (window as any).twoPipeDrawingTool;
    if (tool) {
      if (tool.enabled && tool.activeType === type) {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activeType = type;
        if (type === "heating") {
          tool.activeParams.systemSupply = "Подача";
          tool.activeParams.systemReturn = "Обратка";
        } else {
          tool.activeParams.systemSupply = "Подача_Холод";
          tool.activeParams.systemReturn = "Обратка_Холод";
        }
        tool.activate();
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения унитазов
  const onToggleToiletTool = () => {
    const tool = (window as any).electricalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "toilet") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate("toilet");
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения раковин
  const onToggleSinkTool = () => {
    const tool = (window as any).electricalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "sink") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate("sink");
      }
      update();
    }
  };

  // Переключение состояния инструмента размещения рабочих мест
  const onToggleWorkstationTool = () => {
    const tool = (window as any).electricalPlacementTool;
    if (tool) {
      if (tool.enabled && tool.activeKind === "workstation") {
        tool.deactivate();
      } else {
        deactivateAllTools();
        applyElevationToTools();
        tool.activate("workstation");
      }
      update();
    }
  };

  // Синхронизация выбранных в интерфейсе параметров черчения в DuctDrawingTool
  const syncParamsToTool = () => {
    const tool = (window as any).ductDrawingTool;
    if (!tool) return;

    const item = sortamentList.find(i => i.ref === selectedRef);
    if (!item) return;

    tool.activeParams.shape = selectedShape;
    tool.activeParams.sortamentRef = selectedRef;
    tool.activeParams.system = selectedDuctSystem;
    
    if (selectedShape === "round") {
      tool.activeParams.size = { d: item.d };
    } else {
      tool.activeParams.size = { w: item.w, h: item.h };
    }
    tool.setSnappingSettings({ angleStepDeg: selectedAngleStep });
  };


  let focusBtn: BUI.TemplateResult | undefined;
  if (world.camera instanceof OBC.SimpleCamera) {
    const onFocus = async ({ target }: { target: BUI.Button }) => {
      if (!(world.camera instanceof OBC.SimpleCamera)) return;
      target.loading = true;
      try {
        const tool = (window as any).ductDrawingTool;
        const selected = (window as any).selectedCustomElement;
        
        let targetMesh: THREE.Object3D | null = null;
        if (tool && selected) {
          tool.ductsGroup.traverse((child: any) => {
            if (child.userData?.elementId === selected.id) {
              targetMesh = child;
            }
          });
        }
        
        if (targetMesh) {
          const box = new THREE.Box3().setFromObject(targetMesh);
          box.expandByScalar(0.2); // Add a 200mm padding around the element
          await world.camera.controls.fitToBox(box, true);
        } else {
          // If no custom element is selected, check if there is an IFC selection
          const selection = highlighter.selection.select;
          if (!OBC.ModelIdMapUtils.isEmpty(selection)) {
            await world.camera.fitToItems(selection);
          } else {
            // Nothing selected: Fit the entire model (fittings, ducts, walls, equipment + IFC models)
            const box = new THREE.Box3();
            let hasValidObjects = false;
            
            if (tool && tool.ductsGroup && tool.ductsGroup.children.length > 0) {
              box.expandByObject(tool.ductsGroup);
              hasValidObjects = true;
            }
            
            const fragments = components.get(OBC.FragmentsManager);
            if (fragments && fragments.list.size > 0) {
              for (const group of fragments.list.values()) {
                box.expandByObject(group.object);
                hasValidObjects = true;
              }
            }
            
            if (hasValidObjects) {
              box.expandByScalar(0.5); // Add a 500mm padding around the scene bounds
              await world.camera.controls.fitToBox(box, true);
            } else {
              await world.camera.controls.reset(true);
            }
          }
        }
      } catch (err) {
        console.error("Error focusing camera:", err);
      } finally {
        target.loading = false;
      }
    };

    focusBtn = BUI.html`<bim-button tooltip-title=${tooltips.FOCUS.TITLE} tooltip-text=${tooltips.FOCUS.TEXT} icon=${appIcons.FOCUS} @click=${onFocus}></bim-button>`;
  }

  const onHide = async ({ target }: { target: BUI.Button }) => {
    const selection = highlighter.selection.select;
    if (OBC.ModelIdMapUtils.isEmpty(selection)) return;
    target.loading = true;
    await hider.set(false, selection);
    target.loading = false;
  };

  const onIsolate = async ({ target }: { target: BUI.Button }) => {
    const selection = highlighter.selection.select;
    if (OBC.ModelIdMapUtils.isEmpty(selection)) return;
    target.loading = true;
    await hider.isolate(selection);
    target.loading = false;
  };

  const onShowAll = async ({ target }: { target: BUI.Button }) => {
    target.loading = true;
    await hider.set(true);
    target.loading = false;
  };

  const colorInputId = BUI.Manager.newRandomId();
  const getColorValue = () => {
    const input = document.getElementById(
      colorInputId,
    ) as BUI.ColorInput | null;
    if (!input) return null;
    return input.color;
  };

  const onApplyColor = async ({ target }: { target: BUI.Button }) => {
    const colorValue = getColorValue();
    const selection = highlighter.selection.select;
    if (OBC.ModelIdMapUtils.isEmpty(selection) || !colorValue) return;
    const color = new THREE.Color(colorValue);
    const style = [...highlighter.styles.entries()].find(([, definition]) => {
      if (!definition) return false;
      return definition.color.getHex() === color.getHex();
    });
    target.loading = true;
    if (style) {
      const name = style[0];
      if (name === "select") {
        target.loading = false;
        return;
      }
      await highlighter.highlightByID(name, selection, false, false);
    } else {
      highlighter.styles.set(colorValue, {
        color,
        renderedFaces: FRAGS.RenderedFaces.ONE,
        opacity: 1,
        transparent: false,
      });
      await highlighter.highlightByID(colorValue, selection, false, false);
    }
    await highlighter.clear("select");
    target.loading = false;
  };

  (window as any).__flowProjectActions = {
    save: onSaveProject,
    load: onLoadProject,
    exportExcel: onExportExcel,
    exportIfc: onExportIfc,
    exportRevit: onExportRevit,
    hide: onHide,
    isolate: onIsolate,
    applyColor: onApplyColor,
  };

  // Фильтруем сортамент по выбранной форме
  
  const isDuctToolEnabled = (window as any).ductDrawingTool?.enabled || false;
  const isWallToolEnabled = (window as any).wallDrawingTool?.enabled || false;
  const isGrilleToolEnabled = ((window as any).terminalPlacementTool?.enabled && (window as any).terminalPlacementTool?.activeKind === "grille") || false;
  const isDiffuserToolEnabled = ((window as any).terminalPlacementTool?.enabled && (window as any).terminalPlacementTool?.activeKind === "diffuser") || false;
  const isEquipmentToolEnabled = (window as any).equipmentPlacementTool?.enabled || false;
  const isTrayToolEnabled = (window as any).trayDrawingTool?.enabled || false;
  const isPipeToolEnabled = (window as any).pipeDrawingTool?.enabled || false;
  const isSocketToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "socket") || false;
  const isPanelToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "panel") || false;
  const isLightToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "light") || false;
  const isDoorToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "door") || false;
  const isWindowToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "window") || false;
  const isColumnToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "column") || false;
  const isACToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "ac") || false;
  const isACCeilingToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "ac_ceiling") || false;
  const isRadiatorToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "radiator") || false;
  const isRadiatorConnectToolEnabled = (window as any).__radiatorConnectToolActive === true;
  const isToiletToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "toilet") || false;
  const isSinkToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "sink") || false;
  const isWorkstationToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "workstation") || false;

  const isTwoPipeHeatingActive = ((window as any).twoPipeDrawingTool?.enabled && (window as any).twoPipeDrawingTool?.activeType === "heating") || false;
  const isTwoPipeCoolingActive = ((window as any).twoPipeDrawingTool?.enabled && (window as any).twoPipeDrawingTool?.activeType === "cooling") || false;
  void isTwoPipeCoolingActive;
  const isThrottleToolEnabled = ((window as any).accessoryPlacementTool?.enabled && (window as any).accessoryPlacementTool?.activeKind === "throttle") || false;
  const isSilencerToolEnabled = ((window as any).accessoryPlacementTool?.enabled && (window as any).accessoryPlacementTool?.activeKind === "silencer") || false;
  const isFireDamperToolEnabled = ((window as any).accessoryPlacementTool?.enabled && (window as any).accessoryPlacementTool?.activeKind === "fire_damper") || false;
  const isBallValveToolEnabled = ((window as any).accessoryPlacementTool?.enabled && (window as any).accessoryPlacementTool?.activeKind === "ball_valve") || false;
  const isBalancingToolEnabled = ((window as any).accessoryPlacementTool?.enabled && (window as any).accessoryPlacementTool?.activeKind === "balancing") || false;
  const isFilterToolEnabled = ((window as any).accessoryPlacementTool?.enabled && (window as any).accessoryPlacementTool?.activeKind === "filter") || false;

  // Сантехнические системы для выпадающего списка
  const plumbingSystemKeys = ["ХВС", "ГВС", "Канализация"];
  const allSysSettings = (window as any).systemColorSettings || {};
  const allPipeSystemKeys = plumbingSystemKeys.filter(k => k in allSysSettings);
  if (allPipeSystemKeys.length > 0 && !allPipeSystemKeys.includes(selectedPipeSystem)) {
    selectedPipeSystem = allPipeSystemKeys[0];
    syncPipeParamsToTool();
  }

  const renderDrawingParamsSection = () => {
    if (isDuctToolEnabled) {
      const filteredSortament = sortamentList.filter(
        (item: any) => item.shape === selectedShape && item.ref !== "TRAY-200x80"
      );
      return BUI.html`
        <bim-toolbar-section label="Параметры воздуховода" icon="mdi:pipe">
          <bim-dropdown @change=${(e: any) => {
            const [val] = e.target.value;
            if (val) {
              selectedDuctSystem = val;
              syncParamsToTool();
              syncGlobalsToWindow();
              window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
              update();
            }
          }} tooltip-title="Система" style="width: 7.5rem;">
            ${(() => {
              const sysSettings = (window as any).systemColorSettings || {};
              return Object.keys(sysSettings).map(sys => BUI.html`
                <bim-option label=${sys} value=${sys} ?checked=${selectedDuctSystem === sys}></bim-option>
              `);
            })()}
          </bim-dropdown>
          
          <bim-dropdown @change=${(e: any) => {
            const [val] = e.target.value;
            if (val) {
              selectedShape = val;
              const filtered = sortamentList.filter(item => item.shape === selectedShape);
              if (filtered.length > 0) {
                selectedRef = filtered[0].ref;
              }
              syncParamsToTool();
              syncGlobalsToWindow();
              window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
              update();
            }
          }} tooltip-title="Форма сечения" style="width: 7rem;">
            <bim-option label="Круглый" value="round" ?checked=${selectedShape === "round"}></bim-option>
            <bim-option label="Прямоугольный" value="rectangular" ?checked=${selectedShape === "rectangular"}></bim-option>
          </bim-dropdown>

          <bim-dropdown @change=${(e: any) => {
            const [val] = e.target.value;
            if (val) {
              selectedRef = val;
              syncParamsToTool();
              syncGlobalsToWindow();
              window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
              update();
            }
          }} tooltip-title="Размер сечения" style="width: 8rem;">
            ${filteredSortament.map((item: any) => {
              const label = item.shape === "round" 
                ? `⌀${item.d} мм` 
                : `${item.w}x${item.h} мм`;
              return BUI.html`
                <bim-option label=${label} value=${item.ref} ?checked=${selectedRef === item.ref}></bim-option>
              `;
            })}
          </bim-dropdown>
        </bim-toolbar-section>
      `;
    }
    
    if (isTrayToolEnabled) {
      const traySortament = sortamentList.filter((item: any) => item.shape === "tray");
      return BUI.html`
        <bim-toolbar-section label="Параметры лотка" icon="mdi:lightning-bolt-outline">
          <bim-dropdown @change=${(e: any) => {
            const [val] = e.target.value;
            if (val) {
              selectedTrayRef = val;
              const item = sortamentList.find(i => i.ref === selectedTrayRef);
              if (item) {
                selectedTrayWidth = item.w;
                selectedTrayHeight = item.h;
              }
              syncTrayParamsToTool();
              syncGlobalsToWindow();
              window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
              update();
            }
          }} tooltip-title="Размер лотка" style="width: 8rem;">
            ${traySortament.map((item: any) => BUI.html`
              <bim-option label=${`${item.w}x${item.h} мм`} value=${item.ref} ?checked=${selectedTrayRef === item.ref}></bim-option>
            `)}
          </bim-dropdown>
        </bim-toolbar-section>
      `;
    }
    
    if (isPipeToolEnabled) {
      const pipeSortament = sortamentList.filter((item: any) => item.shape === "pipe");
      return BUI.html`
        <bim-toolbar-section label="Параметры трубопровода" icon="mdi:water-pump">
          <bim-dropdown @change=${(e: any) => {
            const [val] = e.target.value;
            if (val) {
              selectedPipeSystem = val;
              syncPipeParamsToTool();
              syncGlobalsToWindow();
              window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
              update();
            }
          }} tooltip-title="Система" style="width: 7.5rem;">
            ${(() => {
              const sysSettings = (window as any).systemColorSettings || {};
              return Object.keys(sysSettings).map(sys => BUI.html`
                <bim-option label=${sys} value=${sys} ?checked=${selectedPipeSystem === sys}></bim-option>
              `);
            })()}
          </bim-dropdown>
          
          <bim-dropdown @change=${(e: any) => {
            const [val] = e.target.value;
            if (val) {
              selectedPipeMaterial = val;
              syncPipeParamsToTool();
              syncGlobalsToWindow();
              window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
              update();
            }
          }} tooltip-title="Материал" style="width: 7rem;">
            <bim-option label="Сталь" value="steel_water" ?checked=${selectedPipeMaterial === "steel_water"}></bim-option>
            <bim-option label="ППR" value="ppr" ?checked=${selectedPipeMaterial === "ppr"}></bim-option>
          </bim-dropdown>

          <bim-dropdown @change=${(e: any) => {
            const [val] = e.target.value;
            if (val) {
              selectedPipeRef = val;
              const item = sortamentList.find(i => i.ref === selectedPipeRef);
              if (item) {
                selectedPipeDiameter = item.d;
              }
              syncPipeParamsToTool();
              syncGlobalsToWindow();
              window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
              update();
            }
          }} tooltip-title="Диаметр" style="width: 8rem;">
            ${pipeSortament.map((item: any) => BUI.html`
              <bim-option label=${`⌀${item.d} мм`} value=${item.ref} ?checked=${selectedPipeRef === item.ref}></bim-option>
            `)}
          </bim-dropdown>
        </bim-toolbar-section>
      `;
    }

    if (isWallToolEnabled) {
      return BUI.html`
        <bim-toolbar-section label="Параметры стены" icon="mdi:wall">
          <bim-number-input suffix=" мм" step="100" .value=${selectedWallHeight} @change=${(e: any) => {
            const val = Number(e.target.value);
            if (!isNaN(val)) {
              selectedWallHeight = val;
              syncWallParamsToTool();
              syncGlobalsToWindow();
              window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
              update();
            }
          }} tooltip-title="Высота стены" style="width: 6.5rem;"></bim-number-input>

          <bim-dropdown @change=${(e: any) => {
            const [val] = e.target.value;
            if (val) {
              selectedWallThickness = Number(val);
              syncWallParamsToTool();
              syncGlobalsToWindow();
              window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
              update();
            }
          }} tooltip-title="Толщина стены" style="width: 6.5rem;">
            <bim-option label="100 мм" value="100" ?checked=${selectedWallThickness === 100}></bim-option>
            <bim-option label="200 мм" value="200" ?checked=${selectedWallThickness === 200}></bim-option>
            <bim-option label="300 мм" value="300" ?checked=${selectedWallThickness === 300}></bim-option>
            <bim-option label="400 мм" value="400" ?checked=${selectedWallThickness === 400}></bim-option>
          </bim-dropdown>

          <bim-dropdown @change=${(e: any) => {
            const [val] = e.target.value;
            if (val) {
              selectedWallMaterial = val;
              syncWallParamsToTool();
              syncGlobalsToWindow();
              window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
              update();
            }
          }} tooltip-title="Материал" style="width: 7.5rem;">
            <bim-option label="Кирпич" value="brick" ?checked=${selectedWallMaterial === "brick"}></bim-option>
            <bim-option label="Бетон" value="concrete" ?checked=${selectedWallMaterial === "concrete"}></bim-option>
            <bim-option label="Гипсокартон" value="gypsum" ?checked=${selectedWallMaterial === "gypsum"}></bim-option>
          </bim-dropdown>
        </bim-toolbar-section>
      `;
    }

    return BUI.html``;
  };

  type FlowDiscipline = "architecture" | "ventilation" | "heating" | "plumbing" | "electrical";
  const flowState = (window as any).__flowMode || { activeDiscipline: null, drawerOpen: false };
  (window as any).__flowMode = flowState;
  const activeDiscipline = flowState.activeDiscipline as FlowDiscipline | null;

  const setFlowDiscipline = (activeDiscipline: FlowDiscipline | null) => {
    const state = (window as any).__flowMode || { activeDiscipline: null, drawerOpen: false };
    state.activeDiscipline = activeDiscipline;
    (window as any).__flowMode = state;
    window.dispatchEvent(new CustomEvent("flow-state-changed", { detail: { ...state } }));
  };

  const enterDiscipline = (discipline: FlowDiscipline) => {
    deactivateAllTools();
    setFlowDiscipline(discipline);
    window.dispatchEvent(new CustomEvent("flow-discipline-enter", { detail: { discipline } }));
    update();
  };

  const exitDiscipline = () => {
    deactivateAllTools();
    setFlowDiscipline(null);
    window.dispatchEvent(new CustomEvent("flow-discipline-exit"));
    update();
  };

  const disciplineButton = (discipline: FlowDiscipline, icon: string, label: string) => BUI.html`
    <bim-button
      icon=${icon}
      label=${label}
      tooltip-title=${label}
      style="height: 3rem; min-width: 13rem; --bim-button--bgc: rgba(24, 27, 31, 0.92);"
      @click=${() => enterDiscipline(discipline)}
    ></bim-button>
  `;

  const actionButton = (icon: string, label: string, active: boolean, onClick: () => void) => BUI.html`
    <bim-button
      icon=${icon}
      label=${label}
      tooltip-title=${label}
      ?active=${active}
      style="height: 2.5rem;"
      @click=${onClick}
    ></bim-button>
  `;

  const renderActions = () => {
    if (activeDiscipline === "architecture") {
      return BUI.html`
        ${actionButton("mdi:wall", "Стена", isWallToolEnabled, onToggleWallTool)}
        ${actionButton("mdi:door", "Дверь", isDoorToolEnabled, onToggleDoorTool)}
        ${actionButton("mdi:window-maximize", "Окно", isWindowToolEnabled, onToggleWindowTool)}
        ${actionButton("mdi:pillar", "Колонна", isColumnToolEnabled, onToggleColumnTool)}
        ${actionButton("mdi:desk", "Рабочее место", isWorkstationToolEnabled, onToggleWorkstationTool)}
      `;
    }

    if (activeDiscipline === "ventilation") {
      return BUI.html`
        ${actionButton("mdi:pipe", "Воздуховод", isDuctToolEnabled, onToggleDuctTool)}
        ${actionButton("mdi:server", "Вентустановка", isEquipmentToolEnabled, onToggleEquipmentTool)}
        ${actionButton("mdi:grid", "Решетка", isGrilleToolEnabled, onToggleGrilleTool)}
        ${actionButton("mdi:circle-double", "Диффузор", isDiffuserToolEnabled, onToggleDiffuserTool)}
        ${actionButton("mdi:air-conditioner", "Кондиционер", isACToolEnabled, onToggleACTool)}
        ${actionButton("mdi:air-filter", "Кассета", isACCeilingToolEnabled, onToggleACCeilingTool)}
        ${actionButton("mdi:valve", "Дроссель", isThrottleToolEnabled, () => onToggleAccessoryTool("throttle"))}
        ${actionButton("mdi:volume-mute", "Шумоглушитель", isSilencerToolEnabled, () => onToggleAccessoryTool("silencer"))}
        ${actionButton("mdi:fire-alert", "Пожарный клапан", isFireDamperToolEnabled, () => onToggleAccessoryTool("fire_damper"))}
      `;
    }

    if (activeDiscipline === "heating") {
      return BUI.html`
        ${actionButton("mdi:radiator", "Радиатор", isRadiatorToolEnabled, onToggleRadiatorTool)}
        ${actionButton("mdi:vector-difference", "Двухтрубка", isTwoPipeHeatingActive, () => onToggleTwoPipeTool("heating"))}
        ${actionButton("mdi:link-variant", "Подключить", isRadiatorConnectToolEnabled, onToggleRadiatorConnectTool)}
        ${actionButton("mdi:water-boiler-alert", "Кран", isBallValveToolEnabled, () => onToggleAccessoryTool("ball_valve"))}
        ${actionButton("mdi:tune", "Балансировка", isBalancingToolEnabled, () => onToggleAccessoryTool("balancing"))}
        ${actionButton("mdi:filter", "Фильтр", isFilterToolEnabled, () => onToggleAccessoryTool("filter"))}
      `;
    }

    if (activeDiscipline === "plumbing") {
      return BUI.html`
        ${actionButton("mdi:water-pump", "Труба", isPipeToolEnabled, onTogglePipeTool)}
        ${actionButton("mdi:toilet", "Унитаз", isToiletToolEnabled, onToggleToiletTool)}
        ${actionButton("mdi:hand-wash", "Раковина", isSinkToolEnabled, onToggleSinkTool)}
      `;
    }

    if (activeDiscipline === "electrical") {
      return BUI.html`
        ${actionButton("mdi:lightning-bolt-outline", "Лоток", isTrayToolEnabled, onToggleTrayTool)}
        ${actionButton("mdi:power-socket-eu", "Розетка", isSocketToolEnabled, onToggleSocketTool)}
        ${actionButton("mdi:alpha-e-box", "Щит", isPanelToolEnabled, onTogglePanelTool)}
        ${actionButton("mdi:lightbulb-on", "Светильник", isLightToolEnabled, onToggleLightTool)}
      `;
    }

    return BUI.html``;
  };

  const activeTitle: Record<FlowDiscipline, string> = {
    architecture: "Архитектура",
    ventilation: "Вентиляция и кондиционирование",
    heating: "Отопление",
    plumbing: "Водоснабжение и канализация",
    electrical: "Электрика и слаботочка",
  };

  const rootDock = BUI.html`
    <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: center; max-width: calc(100vw - 2rem); overflow-x: auto; padding: 0.25rem;">
      ${disciplineButton("architecture", "mdi:office-building", "Архитектура")}
      ${disciplineButton("ventilation", "mdi:windsock", "Вентиляция и кондиционирование")}
      ${disciplineButton("heating", "mdi:radiator", "Отопление")}
      ${disciplineButton("plumbing", "mdi:water", "Водоснабжение и канализация")}
      ${disciplineButton("electrical", "mdi:flash", "Электрика и слаботочка")}
    </div>
  `;

  const activeDock = activeDiscipline ? BUI.html`
    <div style="display: flex; flex-direction: column; gap: 0.35rem; align-items: center; max-width: calc(100vw - 2rem);">
      <div style="display: flex; gap: 0.45rem; align-items: center; justify-content: center; overflow-x: auto; max-width: 100%; padding: 0.25rem;">
        <bim-button icon="mdi:close" label="Выход" tooltip-title="Выход из режима" style="height: 2.5rem; --bim-ui_accent-base: #64748b;" @click=${exitDiscipline}></bim-button>
        <div style="height: 1.7rem; width: 1px; background: var(--bim-ui_bg-contrast-30); flex: 0 0 auto;"></div>
        ${renderActions()}
        <div style="height: 1.7rem; width: 1px; background: var(--bim-ui_bg-contrast-30); flex: 0 0 auto;"></div>
        ${focusBtn}
        ${actionButton(appIcons.SHOW, "Показать все", false, () => onShowAll({ target: { loading: false } as any }))}
        ${actionButton(appIcons.TRANSPARENT, "Ghost", false, () => onToggleGhost())}
        ${actionButton("mdi:map-marker-plus", "Пометка", (window as any).notePlacementActive || false, onToggleNoteTool)}
      </div>
      <div style="font-size: 0.78rem; color: var(--bim-ui_bg-contrast-70); pointer-events: none;">
        ${activeTitle[activeDiscipline]}
      </div>
    </div>
  ` : BUI.html``;

  return BUI.html`
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; pointer-events: none;">
      <div style="pointer-events: auto; background: rgba(24, 27, 31, 0.82); backdrop-filter: blur(12px); border: 1px solid var(--bim-ui_bg-contrast-30); border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,0.28); padding: 0.35rem;">
        ${activeDiscipline ? activeDock : rootDock}
      </div>
      <div style="pointer-events: auto;">
        ${renderDrawingParamsSection()}
      </div>
    </div>
  `;
};
