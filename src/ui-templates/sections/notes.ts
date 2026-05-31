import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";

export interface NotesPanelState {
  components: OBC.Components;
}

/**
 * Панель «Пометки» — список 3D-аннотаций проекта.
 * Размещение пометки делается кнопкой в тулбаре («Аннотации» → «Пометка») или кнопкой
 * здесь; саму точку ставит обработчик в main.ts (плавающий ввод текста в сцене).
 *
 * NB: механика та же, что нужна для «видовых точек» (сохранённая 3D-точка + камера) —
 * сюда же логично добавить виды позже.
 */
export const notesPanelTemplate: BUI.StatefullComponent<NotesPanelState> = (
  _state,
  update,
) => {
  const listenerName = "__notesPanelListener";
  if ((window as any)[listenerName]) {
    window.removeEventListener("project-notes-updated", (window as any)[listenerName]);
    window.removeEventListener("elements-updated", (window as any)[listenerName]);
    window.removeEventListener("note-mode-changed", (window as any)[listenerName]);
  }
  (window as any)[listenerName] = () => update();
  window.addEventListener("project-notes-updated", (window as any)[listenerName]);
  window.addEventListener("elements-updated", (window as any)[listenerName]);
  window.addEventListener("note-mode-changed", (window as any)[listenerName]);

  const tool = (window as any).ductDrawingTool;
  const elements: any[] = tool ? tool.projectElements : [];
  const world = tool ? tool.world : null;
  const notes = elements.filter((e) => e.type === "note");
  const noteActive = !!(window as any).notePlacementActive;

  const onToggleAdd = () => {
    const active = !(window as any).notePlacementActive;
    (window as any).notePlacementActive = active;
    const vp = document.querySelector("bim-viewport") as HTMLElement | null;
    if (vp) vp.style.cursor = active ? "crosshair" : "default";
    window.dispatchEvent(new CustomEvent("note-mode-changed"));
    update();
  };

  const flyTo = (n: any) => {
    if (!world?.camera?.controls) return;
    const x = n.position[0] / 1000;
    const y = n.position[1] / 1000;
    const z = n.position[2] / 1000;
    world.camera.controls.setLookAt(x + 3, y + 3, z + 3, x, y, z, true);
  };

  const del = (n: any) => {
    const idx = elements.findIndex((e) => e.id === n.id);
    if (idx === -1) return;
    elements.splice(idx, 1);
    tool?.renderAll(elements);
    window.dispatchEvent(new CustomEvent("elements-updated"));
    window.dispatchEvent(new CustomEvent("project-notes-updated"));
    update();
  };

  return BUI.html`
    <bim-panel-section fixed label="Пометки" icon="mdi:comment-text-multiple">
      <div style="display:flex; flex-direction:column; gap:0.6rem; padding:0.5rem; height:100%; overflow:auto;">
        <bim-button
          label=${noteActive ? "Кликните в 3D сцене…" : "Добавить пометку"}
          icon="mdi:map-marker-plus"
          @click=${onToggleAdd}
          style="--bim-ui_accent-base: ${noteActive ? "#fbbf24" : "#3b82f6"};"
        ></bim-button>

        ${notes.length === 0
          ? BUI.html`<div style="text-align:center; color:var(--bim-ui_bg-contrast-60); padding:1.5rem; font-size:0.85rem;">Пометок пока нет. Нажмите «Добавить пометку» и кликните в 3D-сцене.</div>`
          : notes.map(
              (n) => BUI.html`
            <div style="display:flex; flex-direction:column; gap:0.25rem; background-color:var(--bim-ui_bg-contrast-20); padding:0.5rem; border-radius:4px; border-left:3px solid #f59e0b;">
              <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:0.5rem;">
                <div
                  @click=${() => flyTo(n)}
                  title="Показать в 3D"
                  style="font-size:0.82rem; color:var(--bim-ui_bg-contrast-100); font-weight:bold; cursor:pointer; flex:1; word-break:break-word;"
                >${n.text}</div>
                <bim-button
                  icon="mdi:delete"
                  style="--bim-ui_accent-base:#ef4444; flex:0;"
                  @click=${() => del(n)}
                  tooltip-title="Удалить пометку"
                ></bim-button>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--bim-ui_bg-contrast-60);">
                <span>${n.author || "Инженер"}</span><span>${n.createdAt || ""}</span>
              </div>
            </div>
          `,
            )}
      </div>
    </bim-panel-section>
  `;
};
