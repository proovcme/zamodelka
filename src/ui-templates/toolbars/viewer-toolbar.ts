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

const setModelTransparent = (components: OBC.Components) => {
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
    material.opacity = 0.05;
    material.needsUpdate = true;
    if ("color" in material) {
      material.color.setColorName("white");
    } else {
      material.lodColor.setColorName("white");
    }
  }
};

const restoreModelMaterials = () => {
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

const loadSortament = async (callback: () => void) => {
  try {
    const res = await fetch("http://127.0.0.1:8000/sortament");
    if (res.ok) {
      sortamentList = await res.json();
      console.log("Sortament loaded in toolbar:", sortamentList);
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
    }
  } catch (err) {
    console.error("Failed to fetch sortament in toolbar:", err);
  }
};

let currentProjectId = localStorage.getItem("vent_mvp_project_id") || "";

const ensureProjectExists = async () => {
  if (!currentProjectId) {
    try {
      const res = await fetch("http://127.0.0.1:8000/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Новый проект вентиляции" }),
      });
      const data = await res.json();
      currentProjectId = data.id;
      localStorage.setItem("vent_mvp_project_id", currentProjectId);
      console.log("Created project with ID:", currentProjectId);
    } catch (err) {
      console.error("Failed to create project:", err);
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
      alert("Не удалось инициализировать проект на бэкенде.");
      return;
    }
    target.loading = true;
    try {
      const tool = (window as any).ductDrawingTool;
      const graphData = { elements: tool ? tool.projectElements : [] };
      
      const res = await fetch(`http://127.0.0.1:8000/projects/${currentProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: graphData }),
      });
      if (res.ok) {
        alert(`Проект успешно сохранен. ID: ${currentProjectId}`);
      } else {
        alert("Ошибка сохранения проекта.");
      }
    } catch (err) {
      console.error(err);
      alert("Ошибка при сохранении: нет соединения с сервером.");
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
    try {
      const res = await fetch(`http://127.0.0.1:8000/projects/${currentProjectId}`);
      if (res.ok) {
        const data = await res.json();
        const loadedElements = data.graph.elements || [];
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
        alert(`Проект загружен. Имя: "${data.name}", версия: ${data.version}, элементов: ${loadedElements.length}`);
      } else {
        alert("Проект не найден на сервере.");
      }
    } catch (err) {
      console.error(err);
      alert("Ошибка при загрузке: нет соединения с сервером.");
    } finally {
      target.loading = false;
    }
  };

  const onExportExcel = () => {
    if (!currentProjectId) {
      alert("Сначала сохраните проект!");
      return;
    }
    window.open(`http://127.0.0.1:8000/projects/${currentProjectId}/export/xlsx`, "_blank");
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
    if (originalColors.size) {
      restoreModelMaterials();
    } else {
      setModelTransparent(components);
    }
  };

  // Деактивация всех инструментов для предотвращения конфликтов
  const deactivateAllTools = () => {
    (window as any).ductDrawingTool?.deactivate();
    (window as any).wallDrawingTool?.deactivate();
    (window as any).terminalPlacementTool?.deactivate();
    (window as any).equipmentPlacementTool?.deactivate();
    (window as any).trayDrawingTool?.deactivate();
    (window as any).pipeDrawingTool?.deactivate();
    (window as any).electricalPlacementTool?.deactivate();
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
      const selection = highlighter.selection.select;
      target.loading = true;
      await world.camera.fitToItems(
        OBC.ModelIdMapUtils.isEmpty(selection) ? undefined : selection,
      );
      target.loading = false;
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
  const isACToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "ac") || false;
  const isACCeilingToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "ac_ceiling") || false;
  const isRadiatorToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "radiator") || false;
  const isToiletToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "toilet") || false;
  const isSinkToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "sink") || false;
  const isWorkstationToolEnabled = ((window as any).electricalPlacementTool?.enabled && (window as any).electricalPlacementTool?.activeKind === "workstation") || false;

  // Сантехнические системы для выпадающего списка
  const plumbingSystemKeys = ["ХВС", "ГВС", "Канализация"];
  const allSysSettings = (window as any).systemColorSettings || {};
  const allPipeSystemKeys = plumbingSystemKeys.filter(k => k in allSysSettings);
  if (allPipeSystemKeys.length > 0 && !allPipeSystemKeys.includes(selectedPipeSystem)) {
    selectedPipeSystem = allPipeSystemKeys[0];
    syncPipeParamsToTool();
  }

  return BUI.html`
    <bim-toolbar>
      <bim-toolbar-section label="Проект" icon="mdi:folder">
        <bim-button icon="mdi:content-save" tooltip-title="Сохранить" tooltip-text="Сохранить текущую трассу воздуховодов, стены и оборудование в базу данных" @click=${onSaveProject}></bim-button>
        <bim-button icon="mdi:folder-open" tooltip-title="Загрузить" tooltip-text="Загрузить проект с сохраненными трассами и стенами из базы данных" @click=${onLoadProject}></bim-button>
        <bim-button icon="mdi:file-excel" tooltip-title="Скачать Excel" tooltip-text="Выгрузить красивую ГОСТ-ведомость спецификации в Excel" @click=${onExportExcel}></bim-button>
        <bim-button icon="mdi:download-network" tooltip-title="Скачать IFC" tooltip-text="Выгрузить 3D-модель трассы в стандартный формат IFC2x3" @click=${onExportIfc}></bim-button>
      </bim-toolbar-section>
      
      <bim-toolbar-section label="Архитектура" icon="mdi:office-building">
        <bim-button icon="mdi:wall" tooltip-title="Стена" tooltip-text="Черчение стен кирпичных/бетонных/гипсокартонных с привязкой по углам и сетке" ?active=${isWallToolEnabled} @click=${onToggleWallTool}></bim-button>
        <bim-button icon="mdi:door" tooltip-title="Дверь" tooltip-text="Размещение двери в стену (вырезает проем автоматически!)" ?active=${isDoorToolEnabled} @click=${onToggleDoorTool}></bim-button>
        <bim-button icon="mdi:window-maximize" tooltip-title="Окно" tooltip-text="Размещение окна в стену (вырезает проем автоматически!)" ?active=${isWindowToolEnabled} @click=${onToggleWindowTool}></bim-button>
      </bim-toolbar-section>

      <bim-toolbar-section label="Вентиляция" icon="mdi:windsock">
        <bim-button icon="mdi:pipe" tooltip-title="Воздуховод" tooltip-text="Черчение прямых участков воздуховода с привязкой по сетке" ?active=${isDuctToolEnabled} @click=${onToggleDuctTool}></bim-button>
        <bim-button icon="mdi:server" tooltip-title="Вентустановка" tooltip-text="Установка параметрического блока вентустановки 1.2х0.6х0.6м" ?active=${isEquipmentToolEnabled} @click=${onToggleEquipmentTool}></bim-button>
        <bim-button icon="mdi:grid" tooltip-title="Решетка" tooltip-text="Размещение решетки на внешней поверхности воздуховода" ?active=${isGrilleToolEnabled} @click=${onToggleGrilleTool}></bim-button>
        <bim-button icon="mdi:circle-double" tooltip-title="Диффузор" tooltip-text="Размещение круглого диффузора на внешней поверхности воздуховода" ?active=${isDiffuserToolEnabled} @click=${onToggleDiffuserTool}></bim-button>
        <bim-button icon="mdi:air-conditioner" tooltip-title="Настенный кондиционер" tooltip-text="Размещение настенного кондиционера (только на стены!)" ?active=${isACToolEnabled} @click=${onToggleACTool}></bim-button>
        <bim-button icon="mdi:air-filter" tooltip-title="Потолочный кондиционер" tooltip-text="Размещение кассетного потолочного кондиционера (Пробел для поворота)" ?active=${isACCeilingToolEnabled} @click=${onToggleACCeilingTool}></bim-button>
      </bim-toolbar-section>

      <bim-toolbar-section label="Отопление" icon="mdi:radiator">
        <bim-button icon="mdi:water-pump" tooltip-title="Трубопровод" tooltip-text="Черчение трубопроводов с автоматическими отводами и тройниками" ?active=${isPipeToolEnabled} @click=${onTogglePipeTool}></bim-button>
        <bim-button icon="mdi:radiator" tooltip-title="Радиатор" tooltip-text="Размещение секционного радиатора отопления (только на стены!)" ?active=${isRadiatorToolEnabled} @click=${onToggleRadiatorTool}></bim-button>
      </bim-toolbar-section>

      <bim-toolbar-section label="Сантехника" icon="mdi:water">
        <bim-button icon="mdi:toilet" tooltip-title="Унитаз" tooltip-text="Размещение унитаза (nur an Wände!)" ?active=${isToiletToolEnabled} @click=${onToggleToiletTool}></bim-button>
        <bim-button icon="mdi:hand-wash" tooltip-title="Раковина" tooltip-text="Размещение раковины (только на стены!)" ?active=${isSinkToolEnabled} @click=${onToggleSinkTool}></bim-button>
      </bim-toolbar-section>

      <bim-toolbar-section label="Офис" icon="mdi:briefcase">
        <bim-button icon="mdi:monitor" tooltip-title="Рабочее место" tooltip-text="Размещение комплексного рабочего места (стол, стул, ПК) (Пробел для поворота)" ?active=${isWorkstationToolEnabled} @click=${onToggleWorkstationTool}></bim-button>
      </bim-toolbar-section>

      <bim-toolbar-section label="Электрика" icon="mdi:flash">
        <bim-button icon="mdi:lightning-bolt-outline" tooltip-title="Кабельный лоток" tooltip-text="Черчение кабельных лотков с автоматическим размещением углов и тройников" ?active=${isTrayToolEnabled} @click=${onToggleTrayTool}></bim-button>
        <bim-button icon="mdi:power-socket-eu" tooltip-title="Розетка" tooltip-text="Размещение электрической розетки (только на стены!)" ?active=${isSocketToolEnabled} @click=${onToggleSocketTool}></bim-button>
        <bim-button icon="mdi:alpha-e-box" tooltip-title="Щит" tooltip-text="Размещение распределительного щита" ?active=${isPanelToolEnabled} @click=${onTogglePanelTool}></bim-button>
        <bim-button icon="mdi:lightbulb-on" tooltip-title="Светильник" tooltip-text="Размещение потолочного светильника" ?active=${isLightToolEnabled} @click=${onToggleLightTool}></bim-button>
      </bim-toolbar-section>



      <bim-toolbar-section label="Вид" icon=${appIcons.SHOW}>
        <bim-button tooltip-title=${tooltips.SHOW_ALL.TITLE} tooltip-text=${tooltips.SHOW_ALL.TEXT} icon=${appIcons.SHOW} @click=${onShowAll}></bim-button> 
        <bim-button tooltip-title=${tooltips.GHOST.TITLE} tooltip-text=${tooltips.GHOST.TEXT} icon=${appIcons.TRANSPARENT} @click=${onToggleGhost}></bim-button>
      </bim-toolbar-section> 

      <bim-toolbar-section label="Выделение" icon=${appIcons.SELECT}>
        ${focusBtn}
        <bim-button tooltip-title=${tooltips.HIDE.TITLE} tooltip-text=${tooltips.HIDE.TEXT} icon=${appIcons.HIDE} @click=${onHide}></bim-button> 
        <bim-button tooltip-title=${tooltips.ISOLATE.TITLE} tooltip-text=${tooltips.ISOLATE.TEXT} icon=${appIcons.ISOLATE} @click=${onIsolate}></bim-button>
        <bim-button tooltip-title="Окрасить" tooltip-text="Задать цвет выбранным элементам" icon=${appIcons.COLORIZE}>
          <bim-context-menu>
            <div style="display: flex; gap: 0.5rem; width: 10rem;">
              <bim-color-input id=${colorInputId}></bim-color-input>
              <bim-button label="Apply" @click=${onApplyColor}></bim-button>
            </div>
          </bim-context-menu>
        </bim-button>
      </bim-toolbar-section> 
    </bim-toolbar>
  `;
};
