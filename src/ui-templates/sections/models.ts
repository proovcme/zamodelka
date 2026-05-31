import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";

export interface ModelsPanelState {
  components: OBC.Components;
}

export const modelsPanelTemplate: BUI.StatefullComponent<ModelsPanelState> = (
  state,
  update,
) => {
  const { components } = state;
  const world = Array.from(components.get(OBC.Worlds).list.values())[0];

  const ifcLoader = components.get(OBC.IfcLoader);
  const fragments = components.get(OBC.FragmentsManager);

  // Инициализация глобального реестра системных цветов
  if (!(window as any).systemColorSettings) {
    (window as any).systemColorSettings = {
      // Вентиляция
      "Приточный": "синий",
      "Вытяжной": "красный",
      "ДУ": "черный",
      "ПД": "зеленый",
      "КД": "коричневый",
      // Сантехника
      "ХВС": "синий",
      "ГВС": "красный",
      "Канализация": "коричневый",
    };
  }

  // Инициализация пресетов высот настенных элементов
  if (!(window as any).wallHeightPresets) {
    (window as any).wallHeightPresets = {
      socket: 300,
      window: 700,
      radiator: 100,
      door: 0,
      ac: 2200,
      toilet: 0,
      sink: 850
    };
  }

  // Инициализация глобального реестра уровней здания
  if (!(window as any).projectLevels) {
    (window as any).projectLevels = {
      "Уровень пола": 0,
      "Чистовой потолок": 2800,
      "Черновой потолок": 3200,
    };
  }

  // Подписка на кастомные события для реактивного обновления диспетчера проекта
  // Подписка на кастомные события для реактивного обновления диспетчера проекта
  const listenerName = "__projectBrowserSyncListener";
  if ((window as any)[listenerName]) {
    window.removeEventListener("project-levels-updated", (window as any)[listenerName]);
    window.removeEventListener("project-systems-updated", (window as any)[listenerName]);
    window.removeEventListener("elevation-updated", (window as any)[listenerName]);
    window.removeEventListener("drawing-settings-external-updated", (window as any)[listenerName]);
    window.removeEventListener("tool-deactivated", (window as any)[listenerName]);
    window.removeEventListener("active-tool-changed", (window as any)[listenerName]);
    window.removeEventListener("fragments-list-updated", (window as any)[listenerName]);
    window.removeEventListener("ghost-mode-changed", (window as any)[listenerName]);
    window.removeEventListener("project-notes-updated", (window as any)[listenerName]);
  }
  (window as any)[listenerName] = () => update();
  window.addEventListener("project-levels-updated", (window as any)[listenerName]);
  window.addEventListener("project-systems-updated", (window as any)[listenerName]);
  window.addEventListener("elevation-updated", (window as any)[listenerName]);
  window.addEventListener("drawing-settings-external-updated", (window as any)[listenerName]);
  window.addEventListener("tool-deactivated", (window as any)[listenerName]);
  window.addEventListener("active-tool-changed", (window as any)[listenerName]);
  window.addEventListener("fragments-list-updated", (window as any)[listenerName]);
  window.addEventListener("ghost-mode-changed", (window as any)[listenerName]);
  window.addEventListener("project-notes-updated", (window as any)[listenerName]);

  const listListenerName = "__fragmentsListSyncListener";
  if (!(window as any)[listListenerName]) {
    (window as any)[listListenerName] = true;
    fragments.list.onItemSet.add(() => {
      window.dispatchEvent(new CustomEvent("fragments-list-updated"));
    });
    fragments.list.onItemDeleted.add(() => {
      window.dispatchEvent(new CustomEvent("fragments-list-updated"));
    });
  }

  const activeTab = (window as any).projectBrowserActiveTab || "params";

  const onAddIfcModel = async ({ target }: { target: BUI.Button }) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = false;
    input.accept = ".ifc";

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      target.loading = true;
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        // Добавляем таймаут 30 секунд на случай сбоев парсинга
        const loadPromise = ifcLoader.load(bytes, true, file.name.replace(".ifc", ""));
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Превышено время ожидания загрузки IFC. Проверьте WASM.")), 30000)
        );
        await Promise.race([loadPromise, timeoutPromise]);
        alert("Модель IFC успешно загружена!");
      } catch (err: any) {
        console.error("Ошибка загрузки IFC модели:", err);
        alert(`Ошибка загрузки модели: ${err.message || err}`);
      } finally {
        target.loading = false;
        BUI.ContextMenu.removeMenus();
      }
    });

    input.addEventListener("cancel", () => (target.loading = false));
    input.click();
  };

  const onAddFragmentsModel = async ({ target }: { target: BUI.Button }) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = false;
    input.accept = ".frag";

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      target.loading = true;
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      await fragments.core.load(bytes, {
        modelId: file.name.replace(".frag", ""),
      });
      target.loading = false;
      BUI.ContextMenu.removeMenus();
    });

    input.addEventListener("cancel", () => (target.loading = false));
    input.click();
  };

  const onSearchModels = () => {
    update();
  };

  const onToggleModelVisible = (model: any) => {
    model.object.visible = !model.object.visible;
    localStorage.setItem(`model_visible_${model.id}`, model.object.visible ? "true" : "false");
    fragments.core.update(true);
    update();
  };

  const onUnloadModel = async (model: any) => {
    if (confirm(`Вы уверены, что хотите удалить модель "${model.name || model.id}"?`)) {
      try {
        await fragments.core.disposeModel(model.id);
      } catch (e) {
        console.warn("Failed disposeModel, manually removing:", e);
        if (world && world.scene) {
          world.scene.three.remove(model.object);
        }
        fragments.list.delete(model.id);
      }
      fragments.core.update(true);
      update();
    }
  };

  // --- УРОВНИ ЗДАНИЯ ---
  const levels = (window as any).projectLevels || {};
  const currentElev = (window as any).ductDrawingTool?.activeParams?.elevation ?? 0;
  const ductTool = (window as any).ductDrawingTool;
  const projectElements: any[] = ductTool ? ductTool.projectElements : [];

  const onLevelHeightChange = (levelName: string, { target }: { target: BUI.NumberInput }) => {
    const val = target.value;
    if (val === undefined || val === null) return;
    (window as any).projectLevels[levelName] = val;
    
    // Синхронизируем с тулбаром и инструментами
    window.dispatchEvent(new CustomEvent("project-levels-updated"));
    update();
  };

  const onLevelClick = (heightVal: number) => {
    // Диспатчим кастомное событие для тулбара, чтобы обновить активную высоту
    window.dispatchEvent(new CustomEvent("elevation-updated", { detail: { elevation: heightVal } }));
    update();
  };

  const onDeleteLevel = (levelName: string) => {
    if (["Уровень пола", "Чистовой потолок", "Черновой потолок"].includes(levelName)) return;
    delete (window as any).projectLevels[levelName];
    window.dispatchEvent(new CustomEvent("project-levels-updated"));
    update();
  };

  const onAddCustomLevel = () => {
    const nameInput = document.getElementById("browser-new-level-name-input") as BUI.TextInput;
    const heightInput = document.getElementById("browser-new-level-height-input") as BUI.NumberInput;
    const name = nameInput?.value;
    const height = heightInput?.value;
    if (!name || height === undefined || height === null) {
      alert("Введите название уровня и его высоту!");
      return;
    }
    (window as any).projectLevels[name] = height;
    if (nameInput) nameInput.value = "";
    if (heightInput) heightInput.value = 0;
    
    window.dispatchEvent(new CustomEvent("project-levels-updated"));
    update();
  };

  const levelsRows = Object.entries(levels).map(([levelName, heightVal]) => {
    const isCurrent = heightVal === currentElev;
    const isStandard = ["Уровень пола", "Чистовой потолок", "Черновой потолок"].includes(levelName);
    
    return BUI.html`
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background-color: ${isCurrent ? "var(--bim-ui_bg-contrast-20)" : "transparent"}; padding: 0.35rem 0.5rem; border-radius: 4px; margin-bottom: 0.25rem;">
        <div 
          @click=${() => onLevelClick(Number(heightVal))} 
          style="flex: 1; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; font-weight: ${isCurrent ? "bold" : "normal"}; color: ${isCurrent ? "var(--bim-ui_accent-base, #00aaff)" : "var(--bim-ui_bg-contrast-100)"}; font-size: 0.85rem;"
          title="Кликните, чтобы сделать отметку активной"
        >
          ${isCurrent ? BUI.html`<bim-icon icon="mdi:check-circle" style="color: var(--bim-ui_accent-base);"></bim-icon>` : BUI.html`<bim-icon icon="mdi:circle-outline" style="opacity: 0.5;"></bim-icon>`}
          <span>${levelName}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.25rem;">
          <bim-number-input suffix=" мм" step="100" .value=${heightVal} @change=${(e: any) => onLevelHeightChange(levelName, e)} style="width: 5.5rem;"></bim-number-input>
          ${!isStandard ? BUI.html`
            <bim-button icon="mdi:delete" style="--bim-ui_accent-base: #ef4444; flex: 0;" @click=${() => onDeleteLevel(levelName)} tooltip-title="Удалить уровень"></bim-button>
          ` : ""}
        </div>
      </div>
    `;
  });

  const addLevelForm = BUI.html`
    <div style="display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.5rem; border-top: 1px solid var(--bim-ui_bg-contrast-20); padding-top: 0.5rem;">
      <div style="font-size: 0.8rem; font-weight: bold; color: var(--bim-ui_bg-contrast-80);">Новый уровень:</div>
      <div style="display: flex; gap: 0.3rem;">
        <bim-text-input id="browser-new-level-name-input" placeholder="Название..." style="flex: 1;"></bim-text-input>
        <bim-number-input id="browser-new-level-height-input" suffix=" мм" .value=${0} style="width: 6rem;"></bim-number-input>
      </div>
      <bim-button label="Добавить уровень" icon="mdi:plus" style="margin-top: 0.2rem;" @click=${onAddCustomLevel}></bim-button>
    </div>
  `;

  // Пресеты высот настенных элементов
  const presets = (window as any).wallHeightPresets || {};

  const onPresetChange = (key: string, { target }: { target: BUI.NumberInput }) => {
    const val = target.value;
    if (val === undefined || val === null) return;
    (window as any).wallHeightPresets[key] = val;
  };

  const presetLabels: Record<string, string> = {
    socket: "Розетки",
    window: "Подоконник (окна)",
    radiator: "Радиаторы (низ)",
    door: "Двери (порог)",
    ac: "Кондиционеры",
    toilet: "Унитазы",
    sink: "Раковины"
  };

  const presetsRows = Object.entries(presetLabels).map(([key, label]) => BUI.html`
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.25rem 0.5rem; border-radius: 4px; margin-bottom: 0.2rem;">
      <div style="font-size: 0.82rem; color: var(--bim-ui_bg-contrast-80); flex: 1;">${label}</div>
      <bim-number-input suffix=" мм" step="50" .value=${presets[key] ?? 0} @change=${(e: any) => onPresetChange(key, e)} style="width: 5.5rem;"></bim-number-input>
    </div>
  `);

  // --- ДИСПЕТЧЕР СИСТЕМ ---
  const systemsColors = (window as any).systemColorSettings || {};
  const availableColors = ["красный", "синий", "зеленый", "коричневый", "черный"];

  // Группы систем для отображения
  const ventSystems = ["Приточный", "Вытяжной", "ДУ", "ПД", "КД"];
  const plumbingSystems = ["ХВС", "ГВС", "Канализация"];
  const standardSystems = [...ventSystems, ...plumbingSystems];

  const onSystemColorChange = (sys: string, { target }: { target: BUI.Dropdown }) => {
    const [newColor] = target.value;
    if (!newColor) return;
    (window as any).systemColorSettings[sys] = newColor;
    
    // Перерисовываем 3D элементы систем на сцене
    (window as any).ductDrawingTool?.renderAll(projectElements);
    window.dispatchEvent(new CustomEvent("project-systems-updated"));
    update();
  };

  const onDeleteSystem = (sys: string) => {
    if (standardSystems.includes(sys)) return;
    delete (window as any).systemColorSettings[sys];
    
    // Перерисовываем 3D
    (window as any).ductDrawingTool?.renderAll(projectElements);
    window.dispatchEvent(new CustomEvent("project-systems-updated"));
    update();
  };

  const onAddSystem = () => {
    const nameInput = document.getElementById("browser-new-system-name-input") as BUI.TextInput;
    const colorDropdown = document.getElementById("browser-new-system-color-dropdown") as BUI.Dropdown;
    const name = nameInput?.value;
    const [color] = colorDropdown?.value || ["синий"];
    
    if (!name) {
      alert("Введите название системы!");
      return;
    }
    
    (window as any).systemColorSettings[name] = color;
    if (nameInput) nameInput.value = "";
    
    window.dispatchEvent(new CustomEvent("project-systems-updated"));
    update();
  };

  const renderSystemsGroup = (title: string, keys: string[]) => {
    const entries = keys.filter(k => k in systemsColors);
    if (entries.length === 0) return BUI.html``;
    return BUI.html`
      <div style="font-size: 0.78rem; font-weight: bold; color: var(--bim-ui_bg-contrast-60); text-transform: uppercase; letter-spacing: 0.05em; padding: 0.3rem 0.5rem 0.15rem; margin-top: 0.3rem;">${title}</div>
      ${entries.map(sysName => {
        const colorVal = systemsColors[sysName];
        const isStandard = standardSystems.includes(sysName);
        return BUI.html`
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.25rem 0.5rem; border-radius: 4px; margin-bottom: 0.2rem;">
            <div style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-100); flex: 1; word-break: break-all; font-weight: 500;">${sysName}</div>
            <div style="display: flex; align-items: center; gap: 0.25rem;">
              <bim-dropdown @change=${(e: any) => onSystemColorChange(sysName, e)} style="width: 7.5rem;">
                ${availableColors.map(color => BUI.html`
                  <bim-option label=${color} value=${color} ?checked=${colorVal === color}></bim-option>
                `)}
              </bim-dropdown>
              ${!isStandard ? BUI.html`
                <bim-button icon="mdi:delete" style="--bim-ui_accent-base: #ef4444; flex: 0;" @click=${() => onDeleteSystem(sysName)} tooltip-title="Удалить систему"></bim-button>
              ` : ""}
            </div>
          </div>
        `;
      })}
    `;
  };

  // Кастомные системы
  const customSystems = Object.keys(systemsColors).filter(k => !standardSystems.includes(k));
  const customSystemsRows = customSystems.map(sysName => {
    const colorVal = systemsColors[sysName];
    return BUI.html`
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.25rem 0.5rem; border-radius: 4px; margin-bottom: 0.2rem;">
        <div style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-100); flex: 1; word-break: break-all; font-weight: 500;">${sysName}</div>
        <div style="display: flex; align-items: center; gap: 0.25rem;">
          <bim-dropdown @change=${(e: any) => onSystemColorChange(sysName, e)} style="width: 7.5rem;">
            ${availableColors.map(color => BUI.html`
              <bim-option label=${color} value=${color} ?checked=${colorVal === color}></bim-option>
            `)}
          </bim-dropdown>
          <bim-button icon="mdi:delete" style="--bim-ui_accent-base: #ef4444; flex: 0;" @click=${() => onDeleteSystem(sysName)} tooltip-title="Удалить систему"></bim-button>
        </div>
      </div>
    `;
  });

  const addSystemForm = BUI.html`
    <div style="display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.5rem; border-top: 1px solid var(--bim-ui_bg-contrast-20); padding-top: 0.5rem;">
      <div style="font-size: 0.8rem; font-weight: bold; color: var(--bim-ui_bg-contrast-80);">Новая система:</div>
      <div style="display: flex; gap: 0.3rem; align-items: center;">
        <bim-text-input id="browser-new-system-name-input" placeholder="Название..." style="flex: 1;"></bim-text-input>
        <bim-dropdown id="browser-new-system-color-dropdown" style="width: 7.5rem;">
          ${availableColors.map(color => BUI.html`
            <bim-option label=${color} value=${color}></bim-option>
          `)}
        </bim-dropdown>
      </div>
      <bim-button label="Добавить систему" icon="mdi:plus" style="margin-top: 0.2rem;" @click=${onAddSystem}></bim-button>
    </div>
  `;

  // --- ПАРАМЕТРЫ ЧЕРЧЕНИЯ (Диспетчер) ---
  const settings = (window as any).drawingSettings || {
    sortamentList: [],
    selectedShape: "round",
    selectedRef: "",
    currentElevation: 0,
    selectedWallHeight: 3000,
    selectedWallThickness: 200,
    selectedWallMaterial: "brick",
    selectedAngleStep: 5,
    selectedTrayWidth: 200,
    selectedTrayHeight: 80,
    selectedTrayKind: "solid",
    selectedTrayRef: "",
    selectedPipeDiameter: 25,
    selectedPipeMaterial: "steel_water",
    selectedPipeRef: "",
    selectedDuctSystem: "Приточный",
    selectedPipeSystem: "ХВС",
  };

  const updateSetting = (key: string, value: any) => {
    window.dispatchEvent(new CustomEvent("drawing-settings-updated", {
      detail: { key, value }
    }));
    update();
  };

  const isWallToolEnabled = (window as any).wallDrawingTool?.enabled;
  const isDuctToolEnabled = (window as any).ductDrawingTool?.enabled;
  const isTrayToolEnabled = (window as any).trayDrawingTool?.enabled;
  const isPipeToolEnabled = (window as any).pipeDrawingTool?.enabled;

  const currentElevationSetting = settings.currentElevation;
  const selectedAngleStep = settings.selectedAngleStep;

  // Handlers for inputs
  const onLevelSelectChange = ({ target }: { target: BUI.Dropdown }) => {
    const [levelName] = target.value;
    if (!levelName) return;
    const levelsList = (window as any).projectLevels || {};
    if (levelName in levelsList) {
      updateSetting("currentElevation", levelsList[levelName]);
    }
  };

  const onAngleStepChange = ({ target }: { target: BUI.Dropdown }) => {
    const [val] = target.value;
    if (!val) return;
    updateSetting("selectedAngleStep", Number(val));
  };

  const onElevationChange = ({ target }: { target: BUI.NumberInput }) => {
    updateSetting("currentElevation", target.value ?? 0);
  };

  const selectedWallHeight = settings.selectedWallHeight;
  const selectedWallThickness = settings.selectedWallThickness;
  const selectedWallMaterial = settings.selectedWallMaterial;

  const onWallHeightInputChange = ({ target }: { target: BUI.NumberInput }) => {
    updateSetting("selectedWallHeight", target.value ?? 3000);
  };

  const onWallThicknessChange = ({ target }: { target: BUI.Dropdown }) => {
    const [val] = target.value;
    if (!val) return;
    updateSetting("selectedWallThickness", Number(val));
  };

  const onWallMaterialChange = ({ target }: { target: BUI.Dropdown }) => {
    const [val] = target.value;
    if (!val) return;
    updateSetting("selectedWallMaterial", val);
  };

  const sortList = settings.sortamentList || [];
  
  const traySortament = sortList.filter((item: any) => item.shape === "tray");
  const selectedTrayRef = settings.selectedTrayRef || (traySortament[0]?.ref || "");

  const onTraySizeChange = ({ target }: { target: BUI.Dropdown }) => {
    const [val] = target.value;
    if (!val) return;
    updateSetting("selectedTrayRef", val);
  };

  const pipeSortament = sortList.filter((item: any) => item.shape === "pipe");
  const selectedPipeRef = settings.selectedPipeRef || (pipeSortament[0]?.ref || "");
  const selectedPipeMaterial = settings.selectedPipeMaterial || "steel_water";
  const selectedPipeSystem = settings.selectedPipeSystem || "ХВС";

  const onPipeSizeChange = ({ target }: { target: BUI.Dropdown }) => {
    const [val] = target.value;
    if (!val) return;
    updateSetting("selectedPipeRef", val);
  };

  const onPipeMaterialChange = ({ target }: { target: BUI.Dropdown }) => {
    const [val] = target.value;
    if (!val) return;
    updateSetting("selectedPipeMaterial", val);
  };

  const onPipeSystemChange = ({ target }: { target: BUI.Dropdown }) => {
    const [val] = target.value;
    if (!val) return;
    updateSetting("selectedPipeSystem", val);
  };

  const selectedShape = settings.selectedShape || "round";
  const selectedRef = settings.selectedRef || "";
  const selectedDuctSystem = settings.selectedDuctSystem || "Приточный";

  const filteredSortament = sortList.filter(
    (item: any) => item.shape === selectedShape && item.ref !== "TRAY-200x80"
  );

  const onDuctSystemChange = ({ target }: { target: BUI.Dropdown }) => {
    const [val] = target.value;
    if (!val) return;
    updateSetting("selectedDuctSystem", val);
  };

  const onShapeChange = ({ target }: { target: BUI.Dropdown }) => {
    const [val] = target.value;
    if (!val) return;
    updateSetting("selectedShape", val);
  };

  const onSizeChange = ({ target }: { target: BUI.Dropdown }) => {
    const [val] = target.value;
    if (!val) return;
    updateSetting("selectedRef", val);
  };

  const models = Array.from(fragments.list.values());
  const searchQuery = ((document.getElementById("models-search-input") as BUI.TextInput)?.value || "").toLowerCase();

  const filteredModels = models.filter((model: any) => {
    const name = model.name || model.id || "";
    return name.toLowerCase().includes(searchQuery);
  });

  return BUI.html`
    <bim-panel-section fixed icon="mdi:sitemap" label="Диспетчер проекта">
      <div style="height: 100%; display: flex; flex-direction: column;">
        <bim-tabs style="flex: 1; display: flex; flex-direction: column; height: 100%;">
          
          <bim-tab name="params" label="Параметры" icon="mdi:cog" ?active=${activeTab === "params"} @click=${() => { (window as any).projectBrowserActiveTab = "params"; }}>
            <div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem; overflow: auto; height: 100%;">
              
              <!-- Уровень -->
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80); font-weight: 500;">Уровень:</span>
                <bim-dropdown @change=${onLevelSelectChange} style="width: 10rem;">
                  ${Object.entries((window as any).projectLevels || {}).map(([name, val]) => BUI.html`
                    <bim-option label=${`${name} (${val})`} value=${name} ?checked=${currentElevationSetting === val}></bim-option>
                  `)}
                </bim-dropdown>
              </div>

              <!-- Высота (Отметка) -->
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80); font-weight: 500;">Отметка:</span>
                <bim-number-input suffix=" мм" step="100" .value=${currentElevationSetting} @change=${onElevationChange} style="width: 10rem;"></bim-number-input>
              </div>

              <!-- Шаг угла -->
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80); font-weight: 500;">Шаг угла:</span>
                <bim-dropdown @change=${onAngleStepChange} style="width: 10rem;">
                  <bim-option label="1°" value="1" ?checked=${selectedAngleStep === 1}></bim-option>
                  <bim-option label="5°" value="5" ?checked=${selectedAngleStep === 5}></bim-option>
                  <bim-option label="15°" value="15" ?checked=${selectedAngleStep === 15}></bim-option>
                  <bim-option label="45°" value="45" ?checked=${selectedAngleStep === 45}></bim-option>
                  <bim-option label="90°" value="90" ?checked=${selectedAngleStep === 90}></bim-option>
                </bim-dropdown>
              </div>

              <!-- Динамическая секция в зависимости от активного инструмента -->
              ${isWallToolEnabled ? BUI.html`
                <div style="margin-top: 0.75rem; border-top: 1px dashed var(--bim-ui_bg-contrast-20); padding-top: 0.75rem;">
                  <div style="font-size: 0.8rem; font-weight: bold; color: var(--bim-ui_accent-base, #00aaff); text-transform: uppercase; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.25rem;">
                    <bim-icon icon="mdi:wall"></bim-icon>
                    <span>Активен: Стена</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80);">Высота стены:</span>
                    <bim-number-input suffix=" мм" step="100" .value=${selectedWallHeight} @change=${onWallHeightInputChange} style="width: 10rem;"></bim-number-input>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80);">Толщина:</span>
                    <bim-dropdown @change=${onWallThicknessChange} style="width: 10rem;">
                      <bim-option label="100 мм" value="100" ?checked=${selectedWallThickness === 100}></bim-option>
                      <bim-option label="200 мм" value="200" ?checked=${selectedWallThickness === 200}></bim-option>
                      <bim-option label="300 мм" value="300" ?checked=${selectedWallThickness === 300}></bim-option>
                      <bim-option label="400 мм" value="400" ?checked=${selectedWallThickness === 400}></bim-option>
                    </bim-dropdown>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80);">Материал:</span>
                    <bim-dropdown @change=${onWallMaterialChange} style="width: 10rem;">
                      <bim-option label="Кирпич" value="brick" ?checked=${selectedWallMaterial === "brick"}></bim-option>
                      <bim-option label="Бетон" value="concrete" ?checked=${selectedWallMaterial === "concrete"}></bim-option>
                      <bim-option label="Гипсокартон" value="gypsum" ?checked=${selectedWallMaterial === "gypsum"}></bim-option>
                    </bim-dropdown>
                  </div>
                </div>
              ` : ""}

              ${isTrayToolEnabled ? BUI.html`
                <div style="margin-top: 0.75rem; border-top: 1px dashed var(--bim-ui_bg-contrast-20); padding-top: 0.75rem;">
                  <div style="font-size: 0.8rem; font-weight: bold; color: var(--bim-ui_accent-base, #00aaff); text-transform: uppercase; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.25rem;">
                    <bim-icon icon="mdi:lightning-bolt-outline"></bim-icon>
                    <span>Активен: Лоток</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80);">Размер лотка:</span>
                    <bim-dropdown @change=${onTraySizeChange} style="width: 10rem;">
                      ${traySortament.map((item: any) => BUI.html`
                        <bim-option label=${`${item.w}x${item.h} мм`} value=${item.ref} ?checked=${selectedTrayRef === item.ref}></bim-option>
                      `)}
                    </bim-dropdown>
                  </div>
                </div>
              ` : ""}

              ${isPipeToolEnabled ? BUI.html`
                <div style="margin-top: 0.75rem; border-top: 1px dashed var(--bim-ui_bg-contrast-20); padding-top: 0.75rem;">
                  <div style="font-size: 0.8rem; font-weight: bold; color: var(--bim-ui_accent-base, #00aaff); text-transform: uppercase; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.25rem;">
                    <bim-icon icon="mdi:water-pump"></bim-icon>
                    <span>Активен: Трубопровод</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80);">Система:</span>
                    <bim-dropdown @change=${onPipeSystemChange} style="width: 10rem;">
                      ${(() => {
                        const sysSettings = (window as any).systemColorSettings || {};
                        return Object.keys(sysSettings).map(sys => BUI.html`
                          <bim-option label=${sys} value=${sys} ?checked=${selectedPipeSystem === sys}></bim-option>
                        `);
                      })()}
                    </bim-dropdown>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80);">Материал:</span>
                    <bim-dropdown @change=${onPipeMaterialChange} style="width: 10rem;">
                      <bim-option label="Сталь" value="steel_water" ?checked=${selectedPipeMaterial === "steel_water"}></bim-option>
                      <bim-option label="ППR" value="ppr" ?checked=${selectedPipeMaterial === "ppr"}></bim-option>
                    </bim-dropdown>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80);">Диаметр:</span>
                    <bim-dropdown @change=${onPipeSizeChange} style="width: 10rem;">
                      ${pipeSortament.map((item: any) => BUI.html`
                        <bim-option label=${`⌀${item.d} мм`} value=${item.ref} ?checked=${selectedPipeRef === item.ref}></bim-option>
                      `)}
                    </bim-dropdown>
                  </div>
                </div>
              ` : ""}

              ${(!isWallToolEnabled && !isTrayToolEnabled && !isPipeToolEnabled) ? BUI.html`
                <div style="margin-top: 0.75rem; border-top: 1px dashed var(--bim-ui_bg-contrast-20); padding-top: 0.75rem;">
                  <div style="font-size: 0.8rem; font-weight: bold; color: var(--bim-ui_accent-base, #00aaff); text-transform: uppercase; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.25rem;">
                    <bim-icon icon="mdi:pipe"></bim-icon>
                    <span>${isDuctToolEnabled ? "Активен: Воздуховод" : "Параметры вентиляции"}</span>
                  </div>
                  
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80);">Система:</span>
                    <bim-dropdown @change=${onDuctSystemChange} style="width: 10rem;">
                      ${(() => {
                        const sysSettings = (window as any).systemColorSettings || {};
                        return Object.keys(sysSettings).map(sys => BUI.html`
                          <bim-option label=${sys} value=${sys} ?checked=${selectedDuctSystem === sys}></bim-option>
                        `);
                      })()}
                    </bim-dropdown>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80);">Форма:</span>
                    <bim-dropdown @change=${onShapeChange} style="width: 10rem;">
                      <bim-option label="Круглый" value="round" ?checked=${selectedShape === "round"}></bim-option>
                      <bim-option label="Прямоугольный" value="rectangular" ?checked=${selectedShape === "rectangular"}></bim-option>
                    </bim-dropdown>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--bim-ui_bg-contrast-80);">Типоразмер:</span>
                    <bim-dropdown @change=${onSizeChange} style="width: 10rem;">
                      ${filteredSortament.map((item: any) => {
                        const label = item.shape === "round" 
                          ? `⌀${item.d} мм` 
                          : `${item.w}x${item.h} мм`;
                        return BUI.html`
                          <bim-option label=${label} value=${item.ref} ?checked=${selectedRef === item.ref}></bim-option>
                        `;
                      })}
                    </bim-dropdown>
                  </div>
                </div>
              ` : ""}

            </div>
          </bim-tab>
          
          <bim-tab name="levels" label="Уровни" icon="mdi:layers-triple" ?active=${activeTab === "levels"} @click=${() => { (window as any).projectBrowserActiveTab = "levels"; }}>
            <div style="display: flex; flex-direction: column; gap: 1rem; padding: 0.75rem; overflow: auto; height: 100%;">
              <div style="font-weight: bold; font-size: 0.85rem; color: var(--bim-ui_bg-contrast-100); margin-bottom: 0.25rem;">Высотные отметки уровней:</div>
              <div style="display: flex; flex-direction: column; gap: 0.35rem;">
                ${levelsRows}
              </div>
              ${addLevelForm}
              
              <div style="margin-top: 1rem; border-top: 1px solid var(--bim-ui_bg-contrast-20); padding-top: 1rem;">
                <div style="font-weight: bold; font-size: 0.85rem; color: var(--bim-ui_bg-contrast-100); margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.25rem;">
                  <bim-icon icon="mdi:ruler-square"></bim-icon>
                  <span>Пресеты высот установки:</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                  ${presetsRows}
                </div>
              </div>
            </div>
          </bim-tab>
          
          <bim-tab name="systems" label="Системы" icon="solar:settings-bold" ?active=${activeTab === "systems"} @click=${() => { (window as any).projectBrowserActiveTab = "systems"; }}>
            <div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem; overflow: auto; height: 100%;">
              <div style="font-weight: bold; font-size: 0.85rem; color: var(--bim-ui_bg-contrast-100); margin-bottom: 0.25rem;">Реестр систем и расцветка:</div>
              ${renderSystemsGroup("Вентиляция", ventSystems)}
              ${renderSystemsGroup("Сантехника", plumbingSystems)}
              ${customSystemsRows.length > 0 ? BUI.html`
                <div style="font-size: 0.78rem; font-weight: bold; color: var(--bim-ui_bg-contrast-60); text-transform: uppercase; letter-spacing: 0.05em; padding: 0.3rem 0.5rem 0.15rem; margin-top: 0.3rem;">Прочие</div>
                ${customSystemsRows}
              ` : ""}
              ${addSystemForm}
            </div>
          </bim-tab>
          
          <bim-tab name="models" label="Модели" icon="mdi:cube" ?active=${activeTab === "models"} @click=${() => { (window as any).projectBrowserActiveTab = "models"; }}>
            <div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem; overflow: auto; height: 100%;">
              <div style="font-weight: bold; font-size: 0.85rem; color: var(--bim-ui_bg-contrast-100); margin-bottom: 0.1rem;">IFC и фрагмент-подложки:</div>
              
              <div style="display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.2rem;">
                <bim-button label="Загрузить IFC подложку" icon="mdi:file-upload" @click=${onAddIfcModel} style="--bim-ui_accent-base: #3b82f6;"></bim-button>
                <bim-button label="Загрузить Fragments модель" icon="mdi:cube-send" @click=${onAddFragmentsModel}></bim-button>
              </div>

              <!-- Переключатель Ghost-режима -->
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.35rem 0.5rem; background-color: var(--bim-ui_bg-contrast-20); border-radius: 4px; margin-bottom: 0.25rem;">
                <span style="font-size: 0.82rem; color: var(--bim-ui_bg-contrast-80); font-weight: 500;">Полутоновая подложка (Ghost):</span>
                <bim-button 
                  label=${(window as any).isGhostModeActive ? "Вкл" : "Выкл"}
                  icon=${(window as any).isGhostModeActive ? "mdi:eye" : "mdi:eye-off"}
                  style="--bim-ui_accent-base: ${(window as any).isGhostModeActive ? "var(--bim-ui_accent-base, #00aaff)" : "#888888"}; flex: 0; min-width: 3.5rem;"
                  @click=${() => {
                    (window as any).toggleGhostMode();
                    update();
                  }}
                ></bim-button>
              </div>

              <bim-text-input id="models-search-input" @input=${onSearchModels} vertical placeholder="Поиск моделей..." debounce="100" style="width: 100%;"></bim-text-input>
              
              <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem;">
                ${filteredModels.length === 0 ? BUI.html`
                  <div style="font-size: 0.8rem; color: var(--bim-ui_bg-contrast-60); text-align: center; padding: 1rem;">Нет загруженных моделей.</div>
                ` : filteredModels.map((model: any) => {
                  const isVisible = model.object.visible !== false;
                  const name = model.name || model.id || "Без названия";
                  
                  const posX = Math.round(model.object.position.x * 1000);
                  const posY = Math.round(model.object.position.y * 1000);
                  const posZ = Math.round(model.object.position.z * 1000);
                  const rotY = Math.round((model.object.rotation.y * 180) / Math.PI);

                  const onTransformChange = (axis: "x" | "y" | "z" | "rot", val: number) => {
                    if (axis === "x") {
                      model.object.position.x = val / 1000;
                      localStorage.setItem(`model_pos_x_${model.id}`, String(val));
                    }
                    if (axis === "y") {
                      model.object.position.y = val / 1000;
                      localStorage.setItem(`model_pos_y_${model.id}`, String(val));
                    }
                    if (axis === "z") {
                      model.object.position.z = val / 1000;
                      localStorage.setItem(`model_pos_z_${model.id}`, String(val));
                    }
                    if (axis === "rot") {
                      model.object.rotation.y = (val * Math.PI) / 180;
                      localStorage.setItem(`model_rot_y_${model.id}`, String(val));
                    }
                    fragments.core.update(true);
                    update();
                  };

                  const onResetTransform = () => {
                    model.object.position.set(0, 0, 0);
                    model.object.rotation.set(0, 0, 0);
                    localStorage.removeItem(`model_pos_x_${model.id}`);
                    localStorage.removeItem(`model_pos_y_${model.id}`);
                    localStorage.removeItem(`model_pos_z_${model.id}`);
                    localStorage.removeItem(`model_rot_y_${model.id}`);
                    fragments.core.update(true);
                    update();
                  };

                  return BUI.html`
                    <div style="display: flex; flex-direction: column; gap: 0.35rem; background-color: var(--bim-ui_bg-contrast-20); padding: 0.5rem; border-radius: 4px; border-left: 3px solid var(--bim-ui_accent-base, #00aaff);">
                      <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                        <div style="flex: 1; display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: var(--bim-ui_bg-contrast-100); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${name}">
                          <bim-icon icon="mdi:cube-outline" style="opacity: 0.7;"></bim-icon>
                          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: bold;">${name}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.25rem;">
                          <bim-button 
                            icon=${isVisible ? "mdi:eye" : "mdi:eye-off"} 
                            style="--bim-ui_accent-base: ${isVisible ? "var(--bim-ui_accent-base, #00aaff)" : "#888888"}; flex: 0;" 
                            @click=${() => onToggleModelVisible(model)} 
                            tooltip-title=${isVisible ? "Скрыть модель" : "Показать модель"}
                          ></bim-button>
                          <bim-button 
                            icon="mdi:delete" 
                            style="--bim-ui_accent-base: #ef4444; flex: 0;" 
                            @click=${() => onUnloadModel(model)} 
                            tooltip-title="Удалить модель"
                          ></bim-button>
                        </div>
                      </div>
                      
                      <div style="display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.2rem; border-top: 1px dashed var(--bim-ui_bg-contrast-20); padding-top: 0.3rem;">
                        <div style="font-size: 0.72rem; color: var(--bim-ui_bg-contrast-60); font-weight: bold;">Смещение всей подложки:</div>
                        <div style="display: flex; gap: 0.3rem; flex-wrap: wrap;">
                          <div style="display: flex; align-items: center; gap: 0.15rem;">
                            <span style="font-size: 0.72rem; color: #ef4444; font-weight: bold;">X:</span>
                            <bim-number-input suffix=" мм" .value=${posX} @change=${(e: any) => onTransformChange("x", e.target.value ?? 0)} style="width: 4.8rem;"></bim-number-input>
                          </div>
                          <div style="display: flex; align-items: center; gap: 0.15rem;">
                            <span style="font-size: 0.72rem; color: #4ade80; font-weight: bold;">Y:</span>
                            <bim-number-input suffix=" мм" .value=${posY} @change=${(e: any) => onTransformChange("y", e.target.value ?? 0)} style="width: 4.8rem;"></bim-number-input>
                          </div>
                          <div style="display: flex; align-items: center; gap: 0.15rem;">
                            <span style="font-size: 0.72rem; color: #60a5fa; font-weight: bold;">Z:</span>
                            <bim-number-input suffix=" мм" .value=${posZ} @change=${(e: any) => onTransformChange("z", e.target.value ?? 0)} style="width: 4.8rem;"></bim-number-input>
                          </div>
                          <div style="display: flex; align-items: center; gap: 0.15rem;">
                            <span style="font-size: 0.72rem; color: #fbbf24; font-weight: bold;">R°:</span>
                            <bim-number-input suffix="°" .value=${rotY} @change=${(e: any) => onTransformChange("rot", e.target.value ?? 0)} style="width: 3.5rem;"></bim-number-input>
                          </div>
                        </div>
                        <bim-button label="Сбросить положение" icon="mdi:refresh" @click=${onResetTransform} style="margin-top: 0.1rem; --bim-ui_accent-base: #888888; font-size: 0.72rem; height: 1.5rem;"></bim-button>
                      </div>
                    </div>
                  `;
                })}
              </div>
            </div>
          </bim-tab>
          
        </bim-tabs>
      </div>
    </bim-panel-section>
  `;
};
