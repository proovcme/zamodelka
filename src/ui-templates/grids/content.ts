import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as TEMPLATES from "..";
import { CONTENT_GRID_ID, SMALL_COLUMN_WIDTH } from "../../globals";

type Viewer = "viewer";

export type ContentGridElements = [Viewer];

export type ContentGridLayouts = ["Viewer"];

export interface ContentGridState {
  components: OBC.Components;
  world?: OBC.World;
  id: string;
  viewportTemplate: BUI.StatelessComponent;
}

type FlowModeState = {
  activeDiscipline: null | "architecture" | "ventilation" | "heating" | "plumbing" | "electrical";
  drawerOpen: boolean;
};

function ensureFlowModeState(): FlowModeState {
  const existing = (window as any).__flowMode || {};
  const next: FlowModeState = {
    activeDiscipline: existing.activeDiscipline ?? null,
    drawerOpen: existing.drawerOpen === true,
  };
  (window as any).__flowMode = next;
  return next;
}

function setFlowDrawerOpen(drawerOpen: boolean) {
  const state = ensureFlowModeState();
  state.drawerOpen = drawerOpen;
  window.dispatchEvent(new CustomEvent("flow-state-changed", { detail: { ...state } }));
}

function getCachedPanel(key: string, template: BUI.StatefullComponent<any>, components: OBC.Components) {
  if (!(window as any)[key]) {
    const [panel] = BUI.Component.create(template, { components });
    (window as any)[key] = panel;
  }
  return (window as any)[key];
}

export const contentGridTemplate: BUI.StatefullComponent<ContentGridState> = (
  state,
  update
) => {
  const { components } = state;
  const flowMode = ensureFlowModeState();

  const listenerName = "__contentGridFlowListener";
  if ((window as any)[listenerName]) {
    window.removeEventListener("custom-element-selected", (window as any)[listenerName]);
    window.removeEventListener("elements-updated", (window as any)[listenerName]);
    window.removeEventListener("flow-state-changed", (window as any)[listenerName]);
    window.removeEventListener("flow-drawer-toggle", (window as any)[listenerName]);
    window.removeEventListener("properties-panel-toggle", (window as any)[listenerName]);
    window.removeEventListener("keydown", (window as any)[listenerName]);
  }
  (window as any)[listenerName] = (event: CustomEvent | KeyboardEvent) => {
    if (event.type === "keydown") {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === "Escape" && ensureFlowModeState().drawerOpen) {
        setFlowDrawerOpen(false);
      }
      return;
    }
    if (event.type === "flow-drawer-toggle") {
      setFlowDrawerOpen(event.detail?.open ?? !ensureFlowModeState().drawerOpen);
      return;
    }
    if (event.type === "properties-panel-toggle") {
      setFlowDrawerOpen((window as any).isPropertiesPanelOpen === true);
      return;
    }
    update();
  };
  window.addEventListener("custom-element-selected", (window as any)[listenerName]);
  window.addEventListener("elements-updated", (window as any)[listenerName]);
  window.addEventListener("flow-state-changed", (window as any)[listenerName]);
  window.addEventListener("flow-drawer-toggle", (window as any)[listenerName]);
  window.addEventListener("properties-panel-toggle", (window as any)[listenerName]);
  window.addEventListener("keydown", (window as any)[listenerName]);

  const modelsPanel = getCachedPanel("__flowModelsPanelInstance", TEMPLATES.modelsPanelTemplate, components);
  const elementsDataPanel = getCachedPanel("__flowElementsDataPanelInstance", TEMPLATES.elementsDataPanelTemplate, components);
  const specificationPanel = getCachedPanel("__flowSpecificationPanelInstance", TEMPLATES.specificationPanelTemplate, components);
  const systemsPanel = getCachedPanel("__flowSystemsPanelInstance", TEMPLATES.systemsPanelTemplate, components);
  const notesPanel = getCachedPanel("__flowNotesPanelInstance", TEMPLATES.notesPanelTemplate, components);

  const onCreated = (e?: Element) => {
    if (!e) return;
    const grid = e as BUI.Grid<ContentGridLayouts, ContentGridElements>;

    grid.elements = {
      viewer: state.viewportTemplate,
    };

    grid.layouts = {
      Viewer: {
        template: `
          "viewer" 1fr
          /1fr
        `,
      },
    };
  };

  const drawerStyle = `
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    bottom: 0.75rem;
    width: min(${SMALL_COLUMN_WIDTH}, calc(100vw - 2rem));
    background-color: var(--bim-ui_bg-base, #202226);
    border: 1px solid var(--bim-ui_bg-contrast-30, #343941);
    box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);
    z-index: 1200;
    transition: transform 0.22s ease, opacity 0.22s ease;
    transform: ${flowMode.drawerOpen ? "translateX(0)" : "translateX(calc(100% + 1.5rem))"};
    opacity: ${flowMode.drawerOpen ? "1" : "0"};
    pointer-events: ${flowMode.drawerOpen ? "auto" : "none"};
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    overflow: hidden;
  `;

  return BUI.html`
    <div style="position: relative; width: 100%; height: 100%; overflow: hidden;">
      <bim-grid id=${state.id} style="width: 100%; height: 100%;" ${BUI.ref(onCreated)}></bim-grid>

      <bim-button
        icon=${flowMode.drawerOpen ? "mdi:close" : "mdi:menu"}
        tooltip-title=${flowMode.drawerOpen ? "Закрыть меню" : "Открыть меню"}
        style="position: absolute; top: 1rem; right: 1rem; z-index: 1300; width: 2.5rem; height: 2.5rem; --bim-ui_accent-base: #178a99;"
        @click=${() => {
          setFlowDrawerOpen(!ensureFlowModeState().drawerOpen);
        }}
      ></bim-button>

      ${flowMode.drawerOpen ? BUI.html`
        <div
          style="position: absolute; inset: 0; z-index: 1100; background: rgba(0, 0, 0, 0.1);"
          @click=${() => setFlowDrawerOpen(false)}
        ></div>
      ` : ""}

      <aside style=${drawerStyle} @click=${(event: Event) => event.stopPropagation()}>
        <bim-tabs style="height: 100%; display: flex; flex-direction: column;">
          <bim-tab name="project" label="Проект" icon="mdi:sitemap" active>
            ${modelsPanel}
          </bim-tab>
          <bim-tab name="properties" label="Свойства" icon="mdi:card-text-outline">
            ${elementsDataPanel}
          </bim-tab>
          <bim-tab name="specification" label="Спецификация" icon="mdi:format-list-numbered">
            ${specificationPanel}
          </bim-tab>
          <bim-tab name="systems" label="Системы" icon="mdi:vector-polyline">
            ${systemsPanel}
          </bim-tab>
          <bim-tab name="notes" label="Пометки" icon="mdi:comment-text-multiple">
            ${notesPanel}
          </bim-tab>
        </bim-tabs>
      </aside>
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
