import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as TEMPLATES from "..";
import {
  CONTENT_GRID_GAP,
  CONTENT_GRID_ID,
  SMALL_COLUMN_WIDTH,
} from "../../globals";

type Viewer = "viewer";

type Models = {
  name: "models";
  state: TEMPLATES.ModelsPanelState;
};

type ElementData = {
  name: "elementData";
  state: TEMPLATES.ElementsDataPanelState;
};

type Viewpoints = { name: "viewpoints"; state: TEMPLATES.ViewpointsPanelState };

export type ContentGridElements = [Viewer, Models, ElementData, Viewpoints];

export type ContentGridLayouts = ["Viewer"];

export interface ContentGridState {
  components: OBC.Components;
  world?: OBC.World;
  id: string;
  viewportTemplate: BUI.StatelessComponent;
}

export const contentGridTemplate: BUI.StatefullComponent<ContentGridState> = (
  state,
  update
) => {
  const { components } = state;

  const listenerName = "__contentGridSelectionListener";
  if ((window as any)[listenerName]) {
    window.removeEventListener("custom-element-selected", (window as any)[listenerName]);
    window.removeEventListener("elements-updated", (window as any)[listenerName]);
    window.removeEventListener("properties-panel-toggle", (window as any)[listenerName]);
  }
  (window as any)[listenerName] = () => update();
  window.addEventListener("custom-element-selected", (window as any)[listenerName]);
  window.addEventListener("elements-updated", (window as any)[listenerName]);
  window.addEventListener("properties-panel-toggle", (window as any)[listenerName]);

  const panelKey = "__elementsDataPanelInstance";
  let elementsDataPanel = (window as any)[panelKey];
  if (!elementsDataPanel) {
    const [panel] = BUI.Component.create(
      TEMPLATES.elementsDataPanelTemplate,
      { components },
    );
    elementsDataPanel = panel;
    (window as any)[panelKey] = panel;
  }

  const leftBottomTabTemplate: BUI.StatefullComponent = (_state, _update) => {
    // Реальная панель спецификации (BOM по трассе). Создаётся как отдельный
    // компонент и встраивается в первую вкладку.
    const [specificationPanel] = BUI.Component.create(
      TEMPLATES.specificationPanelTemplate,
      { components },
    );

    // Панель «Пометки» вместо заглушки «Видовые точки» (механика та же — 3D-точка + камера;
    // сами виды доделаем позже на этом же фундаменте).
    const [notesPanel] = BUI.Component.create(
      TEMPLATES.notesPanelTemplate,
      { components },
    );

    return BUI.html`
      <bim-tabs style="height: 100%; display: flex; flex-direction: column;">
        <bim-tab name="specification" label="Спецификация" icon="mdi:format-list-numbered" active>
          ${specificationPanel}
        </bim-tab>
        <bim-tab name="notes" label="Пометки" icon="mdi:comment-text-multiple">
          ${notesPanel}
        </bim-tab>
      </bim-tabs>
    `;
  };

  const onCreated = (e?: Element) => {
    if (!e) return;
    const grid = e as BUI.Grid<ContentGridLayouts, ContentGridElements>;

    grid.elements = {
      models: {
        template: TEMPLATES.modelsPanelTemplate,
        initialState: { components },
      },
      viewpoints: {
        template: leftBottomTabTemplate,
        initialState: { components },
      },
      viewer: state.viewportTemplate,
    };

    grid.layouts = {
      Viewer: {
        template: `
          "models viewer" 1fr
          "viewpoints viewer" 1fr
          /${SMALL_COLUMN_WIDTH} 1fr
        `,
      },
    };
  };

  const isOpen = (window as any).isPropertiesPanelOpen === true;

  const drawerStyle = `
    position: absolute;
    top: ${CONTENT_GRID_GAP};
    right: ${CONTENT_GRID_GAP};
    bottom: ${CONTENT_GRID_GAP};
    width: ${SMALL_COLUMN_WIDTH};
    background-color: var(--bim-ui_bg-base, #202226);
    border-left: 1px solid var(--bim-ui_bg-contrast-20);
    box-shadow: -5px 0 15px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transform: ${isOpen ? "translateX(0%)" : "translateX(calc(100% + 40px))"};
    display: flex;
    flex-direction: column;
    border-radius: 4px;
    overflow: hidden;
  `;

  return BUI.html`
    <div style="position: relative; width: 100%; height: 100%; overflow: hidden; display: flex;">
      <bim-grid id=${state.id} style="width: 100%; height: 100%; padding: ${CONTENT_GRID_GAP}; gap: ${CONTENT_GRID_GAP}" ${BUI.ref(onCreated)}></bim-grid>
      <div style=${drawerStyle}>
        ${elementsDataPanel}
      </div>
    </div>
  `;
};

export const getContentGrid = () => {
  const contentGrid = document.getElementById(CONTENT_GRID_ID) as BUI.Grid<
    ContentGridLayouts,
    ContentGridElements
  > | null;

  return contentGrid;
};
