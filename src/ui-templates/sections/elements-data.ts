import * as BUI from "@thatopen/ui";
import * as CUI from "@thatopen/ui-obc";
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { appIcons } from "../../globals";
import { FittingGenerator } from "../../bim-components/FittingGenerator";

export interface ElementsDataPanelState {
  components: OBC.Components;
}

export const elementsDataPanelTemplate: BUI.StatefullComponent<
  ElementsDataPanelState
> = (state, update) => {
  const { components } = state;
  const world = Array.from(components.get(OBC.Worlds).list.values())[0];

  const highlighter = components.get(OBF.Highlighter);

  // Слушаем событие выбора кастомных элементов для обновления панели свойств
  const listenerName = "__customSelectionListener";
  if ((window as any)[listenerName]) {
    window.removeEventListener("custom-element-selected", (window as any)[listenerName]);
    window.removeEventListener("project-systems-updated", (window as any)[listenerName]);
    window.removeEventListener("project-levels-updated", (window as any)[listenerName]);
    window.removeEventListener("radiator-connect-started", (window as any)[listenerName]);
    window.removeEventListener("radiator-connect-cancelled", (window as any)[listenerName]);
  }
  (window as any)[listenerName] = () => update();
  window.addEventListener("custom-element-selected", (window as any)[listenerName]);
  window.addEventListener("project-systems-updated", (window as any)[listenerName]);
  window.addEventListener("project-levels-updated", (window as any)[listenerName]);
  window.addEventListener("radiator-connect-started", (window as any)[listenerName]);
  window.addEventListener("radiator-connect-cancelled", (window as any)[listenerName]);

  const [propsTable, updatePropsTable] = CUI.tables.itemsData({
    components,
    modelIdMap: {},
  });

  propsTable.preserveStructureOnFilter = true;

  highlighter.events.select.onHighlight.add(async (modelIdMap) => {
    // При выборе стандартных IFC элементов сбрасываем кастомное выделение
    (window as any).selectedCustomElement = null;
    updatePropsTable({ modelIdMap });
    update();

    // Центрируем вращение камеры вокруг выбранного IFC элемента
    if (world && world.camera && world.camera.controls) {
      try {
        const boundingBoxer = components.get(OBC.BoundingBoxer);
        const center = await boundingBoxer.getCenter(modelIdMap);
        world.camera.controls.setTarget(center.x, center.y, center.z, true);
      } catch (err) {
        console.error("Error setting camera target for IFC selection:", err);
      }
    }
  });

  highlighter.events.select.onClear.add(() => {
    updatePropsTable({ modelIdMap: {} });
    update();
  });

  const search = (e: Event) => {
    const input = e.target as BUI.TextInput;
    propsTable.queryString = input.value;
  };

  const toggleExpanded = () => {
    propsTable.expanded = !propsTable.expanded;
  };

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
      // Двухтрубная система
      "Подача": "красный",
      "Обратка": "синий",
      "Подача_Холод": "оранжевый",
      "Обратка_Холод": "бирюзовый",
    };
  }

  // Инициализация глобального реестра уровней, если он еще не существует
  if (!(window as any).projectLevels) {
    (window as any).projectLevels = {
      "Уровень пола": 0,
      "Чистовой потолок": 2800,
      "Черновой потолок": 3200,
    };
  }

  const sectionId = BUI.Manager.newRandomId();

  const selectedElement = (window as any).selectedCustomElement;
  const ductTool = (window as any).ductDrawingTool;
  const projectElements: any[] = ductTool ? ductTool.projectElements : [];

  let bodyContent: BUI.TemplateResult;
  let panelLabel: string;

  // Если выбран наш кастомный элемент вентиляции, выводим красивую таблицу свойств
  if (selectedElement) {
    panelLabel = "Свойства элемента";
    const properties: { name: string; value: string; customRender?: BUI.TemplateResult }[] = [];
    const addProp = (name: string, value: any, customRender?: BUI.TemplateResult) => {
      properties.push({ name, value: String(value), customRender });
    };

    addProp("ID", selectedElement.id);
    let typeLabel = "Неизвестный";
    if (selectedElement.type === "duct") typeLabel = "Воздуховод";
    else if (selectedElement.type === "fitting") typeLabel = "Фасонное изделие";
    else if (selectedElement.type === "terminal") typeLabel = "Оконечное устройство";
    else if (selectedElement.type === "wall") typeLabel = "Стена";
    else if (selectedElement.type === "equipment") typeLabel = "Оборудование";
    else if (selectedElement.type === "tray") typeLabel = "Кабельный лоток";
    else if (selectedElement.type === "pipe") typeLabel = "Трубопровод";
    else if (selectedElement.type === "socket") typeLabel = "Розетка электрическая";
    else if (selectedElement.type === "panel") typeLabel = "Щит распределительный";
    else if (selectedElement.type === "light") typeLabel = "Светильник светодиодный";
    else if (selectedElement.type === "door") typeLabel = "Дверь";
    else if (selectedElement.type === "window") typeLabel = "Окно";
    else if (selectedElement.type === "ac") typeLabel = "Кондиционер";
    else if (selectedElement.type === "radiator") typeLabel = "Радиатор отопления";
    else if (selectedElement.type === "toilet") typeLabel = "Унитаз напольный";
    else if (selectedElement.type === "sink") typeLabel = "Раковина";
    addProp("Тип", typeLabel);

    if (selectedElement.type === "duct") {
      addProp("Форма", selectedElement.shape === "round" ? "Круглый" : "Прямоугольный");
      if (selectedElement.shape === "round") {
        addProp("Диаметр", `⌀${selectedElement.size.d} мм`);
      } else {
        addProp("Сечение", `${selectedElement.size.w}x${selectedElement.size.h} мм`);
      }
      
      const dx = selectedElement.end[0] - selectedElement.start[0];
      const dy = selectedElement.end[1] - selectedElement.start[1];
      const dz = selectedElement.end[2] - selectedElement.start[2];
      const lengthMm = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const lengthM = (lengthMm / 1000).toFixed(2);
      addProp("Длина", `${lengthM} м`);

      let area = 0;
      if (selectedElement.shape === "round") {
        area = Math.PI * (selectedElement.size.d / 1000) * (lengthMm / 1000);
      } else {
        area = 2 * ((selectedElement.size.w + selectedElement.size.h) / 1000) * (lengthMm / 1000);
      }
      addProp("Площадь поверхности", `${area.toFixed(2)} м²`);

      const onSystemChange = ({ target }: { target: BUI.Dropdown }) => {
        const [val] = target.value;
        if (!val) return;
        selectedElement.system = val;
        
        // Перегенерируем фитинги, чтобы они тоже обновили цвета
        const updatedElements = FittingGenerator.generateFittings(projectElements);
        projectElements.length = 0;
        projectElements.push(...updatedElements);
        
        // Перерисовываем 3D
        (window as any).ductDrawingTool?.renderAll(projectElements);
        
        // Обновляем спецификацию и UI
        (window as any).ductDrawingTool?.onElementsUpdated();
        update();
      };

      const currentSys = selectedElement.system || "Приточный";
      const sysSettings = (window as any).systemColorSettings || {};
      const systemDropdown = BUI.html`
        <bim-dropdown @change=${onSystemChange} style="width: 100%;">
          ${Object.keys(sysSettings).map(sys => BUI.html`
            <bim-option label=${sys} value=${sys} ?checked=${currentSys === sys}></bim-option>
          `)}
        </bim-dropdown>
      `;

      addProp("Система", selectedElement.system || "Приточный", systemDropdown);
      addProp("Материал", selectedElement.material === "steel_galv" ? "Оцинкованная сталь" : selectedElement.material);
    } 
    else if (selectedElement.type === "wall") {
      const dx = selectedElement.end[0] - selectedElement.start[0];
      const dy = selectedElement.end[1] - selectedElement.start[1];
      const dz = selectedElement.end[2] - selectedElement.start[2];
      const lengthMm = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const lengthM = (lengthMm / 1000).toFixed(2);
      
      const heightM = selectedElement.height / 1000;
      const thicknessM = selectedElement.thickness / 1000;
      
      const area = 2 * heightM * (lengthMm / 1000);
      const volume = thicknessM * heightM * (lengthMm / 1000);
      
      let matLabel = selectedElement.material;
      if (selectedElement.material === "brick") matLabel = "Кирпич";
      else if (selectedElement.material === "concrete") matLabel = "Бетон";
      else if (selectedElement.material === "gypsum") matLabel = "Гипсокартон";
      
      addProp("Материал", matLabel);
      addProp("Толщина", `${selectedElement.thickness} мм`);
      addProp("Высота", `${selectedElement.height} мм`);
      addProp("Длина", `${lengthM} м`);
      addProp("Площадь поверхности", `${area.toFixed(2)} м²`);
      addProp("Объем стены", `${volume.toFixed(2)} м³`);
    }
    else if (selectedElement.type === "fitting") {
      addProp("Вид", selectedElement.kind === "bend" ? "Отвод" : selectedElement.kind === "tee" ? "Тройник" : "Переход");
      if (selectedElement.angle) {
        addProp("Угол", `${selectedElement.angle}°`);
      }
      if (selectedElement.size) {
        if (selectedElement.size.d) {
          addProp("Размер", `⌀${selectedElement.size.d} мм`);
        } else if (selectedElement.size.w) {
          addProp("Размер", `${selectedElement.size.w}x${selectedElement.size.h} мм`);
        }
      }
    } 
    else if (selectedElement.type === "terminal") {
      addProp("Тип прибора", selectedElement.kind === "grille" ? "Решетка" : "Диффузор");
      addProp("Модель", selectedElement.model);
      
      if (selectedElement.position) {
        addProp("Высота установки", `${Math.round(selectedElement.position[1])} мм`);
        addProp("Координаты", `${Math.round(selectedElement.position[0])}, ${Math.round(selectedElement.position[1])}, ${Math.round(selectedElement.position[2])}`);
      }
      
      const ductsList = projectElements.filter((d: any) => d.type === "duct");
      
      const onHostChange = ({ target }: { target: BUI.Dropdown }) => {
        const [ductId] = target.value;
        selectedElement.host = ductId || "";
        
        if (ductId) {
          const hostDuct = ductsList.find((d: any) => d.id === ductId);
          if (hostDuct) {
            const pStart = new THREE.Vector3(hostDuct.start[0], hostDuct.start[1], hostDuct.start[2]);
            const pEnd = new THREE.Vector3(hostDuct.end[0], hostDuct.end[1], hostDuct.end[2]);
            const pTerm = new THREE.Vector3(selectedElement.position[0], selectedElement.position[1], selectedElement.position[2]);
            
            const ab = new THREE.Vector3().subVectors(pEnd, pStart);
            const ap = new THREE.Vector3().subVectors(pTerm, pStart);
            let t = ap.dot(ab) / ab.dot(ab);
            t = Math.max(0, Math.min(1, t));
            const proj = new THREE.Vector3().addVectors(pStart, ab.multiplyScalar(t));
            
            const radius = (hostDuct.size.d || 200) / 2;
            const h = (hostDuct.size.h || 200);
            const offset = hostDuct.shape === "round" ? radius : h / 2;
            
            selectedElement.position = [proj.x, proj.y + offset + 10, proj.z];
          }
        }
        
        // Перерисовываем и обновляем
        (window as any).ductDrawingTool?.renderAll(projectElements);
        (window as any).ductDrawingTool?.onElementsUpdated();
        update();
      };
      
      const hostDropdown = BUI.html`
        <bim-dropdown @change=${onHostChange} style="width: 100%;">
          <bim-option label="<Не подключен>" value="" ?checked=${!selectedElement.host}></bim-option>
          ${ductsList.map((duct: any) => {
            const ductLabel = `${duct.system || "Приточный"} (${duct.shape === "round" ? `⌀${duct.size.d}` : `${duct.size.w}x${duct.size.h}`}) [ID: ${duct.id.substring(5, 9)}]`;
            return BUI.html`
              <bim-option label=${ductLabel} value=${duct.id} ?checked=${selectedElement.host === duct.id}></bim-option>
            `;
          })}
        </bim-dropdown>
      `;
      
      addProp("Подключение к воздуховоду", selectedElement.host || "", hostDropdown);
    } 
    else if (selectedElement.type === "equipment") {
      addProp("Тип оборудования", "Приточно-вытяжная установка");
      addProp("Модель", selectedElement.model);
      addProp("Габариты", `${selectedElement.size.l}x${selectedElement.size.w}x${selectedElement.size.h} мм`);
      addProp("Поворот", `${selectedElement.rotation}°`);
    }
    else if (selectedElement.type === "tray") {
      let kindLabel = "Сплошной";
      if (selectedElement.kind === "perforated") kindLabel = "Перфорированный";
      else if (selectedElement.kind === "ladder") kindLabel = "Лестничный";
      
      addProp("Тип лотка", kindLabel);
      addProp("Ширина", `${selectedElement.width} мм`);
      addProp("Высота борта", `${selectedElement.height} мм`);
      
      const dx = selectedElement.end[0] - selectedElement.start[0];
      const dy = selectedElement.end[1] - selectedElement.start[1];
      const dz = selectedElement.end[2] - selectedElement.start[2];
      const lengthMm = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const lengthM = (lengthMm / 1000).toFixed(2);
      addProp("Длина", `${lengthM} м`);
      
      addProp("Система", selectedElement.system || "Силовые");
    }
    else if (selectedElement.type === "pipe") {
      addProp("Диаметр", `⌀${selectedElement.size.d} мм`);
      
      let matLabel = selectedElement.material === "steel_water" ? "Сталь" : "ППР";
      addProp("Материал", matLabel);
      
      const dx = selectedElement.end[0] - selectedElement.start[0];
      const dy = selectedElement.end[1] - selectedElement.start[1];
      const dz = selectedElement.end[2] - selectedElement.start[2];
      const lengthMm = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const lengthM = (lengthMm / 1000).toFixed(2);
      addProp("Длина", `${lengthM} м`);
      
      addProp("Система", selectedElement.system || "ХВС");
    }
    else if (selectedElement.type === "socket") {
      addProp("Модель", selectedElement.model);
      if (selectedElement.position) {
        addProp("Высота установки", `${Math.round(selectedElement.position[1])} мм`);
        addProp("Координаты", `${Math.round(selectedElement.position[0])}, ${Math.round(selectedElement.position[1])}, ${Math.round(selectedElement.position[2])}`);
      }
    }
    else if (selectedElement.type === "panel") {
      addProp("Модель", selectedElement.model);
      addProp("Габариты", "400x600x200 мм");
      addProp("Поворот", `${selectedElement.rotation}°`);
      if (selectedElement.position) {
        addProp("Координаты", `${Math.round(selectedElement.position[0])}, ${Math.round(selectedElement.position[1])}, ${Math.round(selectedElement.position[2])}`);
      }
    }
    else if (selectedElement.type === "light") {
      addProp("Модель", selectedElement.model);
      addProp("Габариты", "600x600x50 мм");
      if (selectedElement.position) {
        addProp("Высота установки", `${Math.round(selectedElement.position[1])} мм`);
        addProp("Координаты", `${Math.round(selectedElement.position[0])}, ${Math.round(selectedElement.position[1])}, ${Math.round(selectedElement.position[2])}`);
      }
    }
    else if (selectedElement.type === "door") {
      addProp("Модель", selectedElement.model);
      addProp("Ширина проема", `${selectedElement.width} мм`);
      addProp("Высота проема", `${selectedElement.height} мм`);
      if (selectedElement.position) {
        addProp("Координаты", `${Math.round(selectedElement.position[0])}, ${Math.round(selectedElement.position[1])}, ${Math.round(selectedElement.position[2])}`);
      }
    }
    else if (selectedElement.type === "window") {
      addProp("Модель", selectedElement.model);
      addProp("Ширина", `${selectedElement.width} мм`);
      addProp("Высота", `${selectedElement.height} мм`);
      if (selectedElement.position) {
        addProp("Высота установки", `${Math.round(selectedElement.position[1])} мм`);
        addProp("Координаты", `${Math.round(selectedElement.position[0])}, ${Math.round(selectedElement.position[1])}, ${Math.round(selectedElement.position[2])}`);
      }
    }
    else if (selectedElement.type === "ac") {
      addProp("Модель", selectedElement.model);
      if (selectedElement.position) {
        addProp("Высота установки", `${Math.round(selectedElement.position[1])} мм`);
        addProp("Координаты", `${Math.round(selectedElement.position[0])}, ${Math.round(selectedElement.position[1])}, ${Math.round(selectedElement.position[2])}`);
      }
    }
    else if (selectedElement.type === "radiator") {
      addProp("Модель", selectedElement.model);
      if (selectedElement.connectionNodeType === "radiator_lower") {
        addProp("Подключение", "Нижнее");
      }
      if (selectedElement.position) {
        addProp("Высота установки", `${Math.round(selectedElement.position[1])} мм`);
        addProp("Координаты", `${Math.round(selectedElement.position[0])}, ${Math.round(selectedElement.position[1])}, ${Math.round(selectedElement.position[2])}`);
      }
    }
    else if (selectedElement.type === "ac_ceiling") {
      addProp("Модель", selectedElement.model);
      if (selectedElement.position) {
        addProp("Высота установки", `${Math.round(selectedElement.position[1])} мм`);
        addProp("Координаты", `${Math.round(selectedElement.position[0])}, ${Math.round(selectedElement.position[1])}, ${Math.round(selectedElement.position[2])}`);
      }
    }
    else if (selectedElement.type === "toilet") {
      addProp("Модель", selectedElement.model);
      addProp("Габариты", "700×480 мм (Ш×Г)");
      if (selectedElement.position) {
        addProp("Высота установки", `${Math.round(selectedElement.position[1])} мм`);
        addProp("Координаты", `${Math.round(selectedElement.position[0])}, ${Math.round(selectedElement.position[1])}, ${Math.round(selectedElement.position[2])}`);
      }
    }
    else if (selectedElement.type === "sink") {
      addProp("Модель", selectedElement.model);
      addProp("Габариты", "550×450 мм (Ш×Г)");
      if (selectedElement.position) {
        addProp("Высота установки", `${Math.round(selectedElement.position[1])} мм`);
        addProp("Координаты", `${Math.round(selectedElement.position[0])}, ${Math.round(selectedElement.position[1])}, ${Math.round(selectedElement.position[2])}`);
      }
    }

    const propertyRows = properties.map(prop => BUI.html`
      <div style="color: var(--bim-ui_bg-contrast-80); font-weight: 500; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); padding: 0.4rem 0.35rem; font-size: 0.85rem; display: flex; align-items: center;">
        ${prop.name}
      </div>
      <div style="color: var(--bim-ui_bg-contrast-100); border-bottom: 1px solid var(--bim-ui_bg-contrast-20); padding: 0.4rem 0.35rem; font-size: 0.85rem; word-break: break-all; display: flex; align-items: center;">
        ${prop.customRender ? prop.customRender : prop.value}
      </div>
    `);

    const onDelete = () => {
      if (!projectElements || !selectedElement) return;
      
      const index = projectElements.indexOf(selectedElement);
      if (index !== -1) {
        projectElements.splice(index, 1);
        
        if (
          selectedElement.type === "duct" ||
          selectedElement.type === "tray" ||
          selectedElement.type === "pipe" ||
          selectedElement.type === "fitting"
        ) {
          const updatedElements = FittingGenerator.generateFittings(projectElements);
          projectElements.length = 0;
          projectElements.push(...updatedElements);
        }
        
        (window as any).ductDrawingTool?.renderAll(projectElements);
        (window as any).selectedCustomElement = null;
        
        const highlighter = components.get(OBF.Highlighter);
        highlighter.clear("select");
        
        (window as any).ductDrawingTool?.onElementsUpdated();
        window.dispatchEvent(new CustomEvent("custom-element-selected", { detail: null }));
      }
    };

    const onClose = () => {
      const highlighter = components.get(OBF.Highlighter);
      highlighter.clear("select");
      (window as any).selectedCustomElement = null;
      (window as any).isPropertiesPanelOpen = false;
      window.dispatchEvent(new CustomEvent("properties-panel-toggle"));
      window.dispatchEvent(new CustomEvent("custom-element-selected", { detail: null }));
    };

    const onConnect = () => {
      if (!selectedElement) return;
      const highlighter = components.get(OBF.Highlighter);
      highlighter.clear("select");
      (window as any).selectedCustomElement = null;
      window.dispatchEvent(new CustomEvent("custom-element-selected", { detail: null }));
      (window as any).terminalPlacementTool?.activateConnectionMode(selectedElement);
    };

    const onConnectRadiator = () => {
      if (!selectedElement) return;
      const highlighter = components.get(OBF.Highlighter);
      highlighter.clear("select");
      window.dispatchEvent(new CustomEvent("radiator-connect-start", {
        detail: { radiator: selectedElement },
      }));
    };

    bodyContent = BUI.html`
      <div style="display: flex; flex-direction: column; gap: 0.8rem; width: 100%; max-height: 100%; overflow: auto; padding-bottom: 0.5rem;">
        <div style="display: flex; justify-content: flex-end; margin-top: -0.25rem;">
          <bim-button 
            icon="mdi:close" 
            tooltip-title="Закрыть панель"
            style="--bim-ui_accent-base: var(--bim-ui_bg-contrast-100);"
            @click=${onClose}>
          </bim-button>
        </div>
        <div style="display: grid; grid-template-columns: 40% 60%; width: 100%; border-top: 1px solid var(--bim-ui_bg-contrast-20); margin-top: 0.25rem;">
          ${propertyRows}
        </div>
        ${selectedElement.type === "terminal" ? BUI.html`
          <bim-button 
            label="Подключить к воздуховоду" 
            icon="mdi:vector-line" 
            style="--bim-ui_accent-base: #3b82f6; margin-top: 0.5rem;" 
            @click=${onConnect}>
          </bim-button>
        ` : ""}
        ${selectedElement.type === "radiator" ? BUI.html`
          <bim-button
            label="Подключить к трубам"
            icon="mdi:vector-difference"
            style="--bim-ui_accent-base: #3b82f6; margin-top: 0.5rem;"
            @click=${onConnectRadiator}>
          </bim-button>
        ` : ""}
        <bim-button 
          label="Удалить элемент" 
          icon="mdi:delete" 
          style="--bim-ui_accent-base: #ef4444; margin-top: 0.5rem;" 
          @click=${onDelete}>
        </bim-button>
      </div>
    `;
  } else {
    panelLabel = "Selection Data";

    bodyContent = BUI.html`
      <div style="display: flex; gap: 0.375rem; margin-bottom: 0.5rem;">
        <bim-text-input @input=${search} vertical placeholder="Поиск по свойствам..." debounce="200" style="flex: 1;"></bim-text-input>
        <bim-button style="flex: 0;" @click=${toggleExpanded} icon=${appIcons.EXPAND}></bim-button>
        <bim-button style="flex: 0;" @click=${() => propsTable.downloadData("ElementData", "tsv")} icon=${appIcons.EXPORT} tooltip-title="Export Data" tooltip-text="Export the shown properties to TSV."></bim-button>
      </div>
      ${propsTable}
    `;
  }

  return BUI.html`
    <bim-panel-section fixed id=${sectionId} icon=${appIcons.TASK} label=${panelLabel}>
      ${bodyContent}
    </bim-panel-section>
  `;
};
