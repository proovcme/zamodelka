import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { FittingGenerator } from "./FittingGenerator";

export interface ConnectFlowTooltipTexts {
  title1: string;
  action1: string;
  hoverAction1: string;
  detail1: string;
  footer1?: string;

  title2: string;
  action2: string;
  hoverAction2: string;
  detail2: string;
  footer2?: string;

  deviceLabel: string;
}

export interface ConnectFlowConfig {
  id: string; // e.g. "radiator", "terminal", "ac"
  deviceColor?: number;
  targetColor?: number;
  
  isValidDevice: (elem: any) => boolean;
  isValidTarget: (elem: any) => boolean;

  collectDeviceMeshes: () => THREE.Object3D[];
  collectTargetMeshes: () => THREE.Object3D[];

  tooltipPhaseTexts: ConnectFlowTooltipTexts;
  connect: (elements: any[], device: any, target: any) => { ok: boolean; error?: string };
}

export class ConnectFlow {
  components: OBC.Components;
  world: OBC.World;
  projectElements: any[];
  ductDrawingTool: any;
  viewport: HTMLElement;
  config: ConnectFlowConfig;

  active = false;
  targetDevice: any | null = null;
  tooltip: HTMLDivElement | null = null;

  deviceHighlights = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  targetHighlights = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

  constructor(
    components: OBC.Components,
    world: OBC.World,
    projectElements: any[],
    ductDrawingTool: any,
    viewport: HTMLElement,
    config: ConnectFlowConfig
  ) {
    this.components = components;
    this.world = world;
    this.projectElements = projectElements;
    this.ductDrawingTool = ductDrawingTool;
    this.viewport = viewport;
    this.config = config;

    this.setupEventListeners();
  }

  private setupEventListeners() {
    window.addEventListener(`${this.config.id}-connect-start`, (event: any) => {
      this.activate(event.detail?.[this.config.id] || event.detail?.device);
    });

    window.addEventListener(`${this.config.id}-connect-toggle`, () => {
      if (this.active) this.clear();
      else this.activate();
    });

    window.addEventListener(`${this.config.id}-connect-stop`, () => {
      this.clear();
    });

    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "SELECT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.hasAttribute("contenteditable"))
      ) {
        return;
      }
      if (this.active) {
        this.clear();
      }
    });

    this.viewport.addEventListener("pointermove", (event) => {
      if (!this.active) return;
      const hoverElem = this.getHoverElement(event);
      this.updateCursor(hoverElem);
      this.showTooltip(event, hoverElem);
    });

    this.viewport.addEventListener("pointerleave", () => {
      this.hideTooltip();
    });

    this.viewport.addEventListener("pointerdown", (event) => {
      if (!this.active) return;
      if (event.button !== 0) return; // Only left click

      const hoverElem = this.getHoverElement(event);
      if (!this.targetDevice) {
        if (!hoverElem || !this.config.isValidDevice(hoverElem)) {
          console.warn(`Выберите прибор (${this.config.tooltipPhaseTexts.deviceLabel}) для серийного подключения.`);
          return;
        }
        this.setTargetDevice(hoverElem);
      } else {
        if (!hoverElem || !this.config.isValidTarget(hoverElem)) {
          console.warn(`Выберите подходящую цель для подключения.`);
          return;
        }

        const result = this.config.connect(this.projectElements, this.targetDevice, hoverElem);
        if (!result.ok) {
          console.warn(result.error || "Не удалось подключить прибор.");
          alert(result.error || "Не удалось подключить прибор.");
          return;
        }

        // FittingGenerator.generateFittings -> renderAll -> elements-updated sequence
        const updated = FittingGenerator.generateFittings(this.projectElements);
        this.projectElements.length = 0;
        this.projectElements.push(...updated);

        this.restoreHighlights();
        this.ductDrawingTool.renderAll(this.projectElements);
        window.dispatchEvent(new CustomEvent("elements-updated"));
        
        this.rearm();
      }
    });
  }

  activate(device?: any) {
    // Stop all other connect flows and tools
    window.dispatchEvent(new CustomEvent("radiator-connect-stop"));
    window.dispatchEvent(new CustomEvent("terminal-connect-stop"));
    window.dispatchEvent(new CustomEvent("ac-connect-stop"));
    
    (window as any).ductDrawingTool?.deactivate();
    (window as any).wallDrawingTool?.deactivate();
    (window as any).terminalPlacementTool?.deactivate();
    (window as any).equipmentPlacementTool?.deactivate();
    (window as any).trayDrawingTool?.deactivate();
    (window as any).pipeDrawingTool?.deactivate();
    (window as any).electricalPlacementTool?.deactivate();
    (window as any).accessoryPlacementTool?.deactivate();
    (window as any).twoPipeDrawingTool?.deactivate();

    this.active = true;
    (window as any).selectedCustomElement = null;
    window.dispatchEvent(new CustomEvent("custom-element-selected", { detail: null }));

    const domEl = this.world.renderer?.three.domElement.parentElement;
    if (domEl) domEl.style.cursor = "crosshair";

    if (device && this.config.isValidDevice(device)) {
      this.setTargetDevice(device);
    } else {
      this.targetDevice = null;
      this.highlightDevices();
      this.updateState();
    }

    window.dispatchEvent(new CustomEvent(`${this.config.id}-connect-started`));
  }

  clear() {
    const wasActive = this.active || !!this.targetDevice;
    this.restoreHighlights();
    this.removeTooltip();
    this.active = false;
    this.targetDevice = null;

    const domEl = this.world.renderer?.three.domElement.parentElement;
    if (domEl) domEl.style.cursor = "";

    this.updateState();
    if (wasActive) {
      window.dispatchEvent(new CustomEvent(`${this.config.id}-connect-cancelled`));
    }
  }

  private rearm() {
    this.targetDevice = null;
    this.restoreHighlights();
    this.highlightDevices();
    this.updateState();
  }

  private setTargetDevice(device: any) {
    this.targetDevice = device;
    this.restoreHighlights();
    this.highlightTargets();
    this.updateState();
  }

  private updateState() {
    (window as any)[`__${this.config.id}ConnectToolActive`] = this.active;
    (window as any)[`__${this.config.id}ConnectTargetId`] = this.targetDevice?.id || null;
    
    window.dispatchEvent(new CustomEvent(`${this.config.id}-connect-changed`, {
      detail: {
        active: this.active,
        targetId: this.targetDevice?.id || null,
        phase: this.targetDevice ? "pick-target" : "pick-device",
      },
    }));
  }

  private getHoverElement(event: MouseEvent) {
    const dom = this.world.renderer?.three.domElement;
    if (!dom) return null;

    const rect = dom.getBoundingClientRect();
    const selectionMouse = new THREE.Vector2();
    selectionMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    selectionMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(selectionMouse, this.world.camera.three);

    const targets = this.targetDevice ? this.config.collectTargetMeshes() : this.config.collectDeviceMeshes();
    const intersects = raycaster.intersectObjects(targets, true);
    if (intersects.length > 0) {
      return this.getCustomElementFromObject(intersects[0].object);
    }
    return null;
  }

  private getCustomElementFromObject(object: THREE.Object3D | null) {
    let current: THREE.Object3D | null = object;
    while (current) {
      const elementId = current.userData?.elementId;
      if (elementId) {
        const element = this.projectElements.find((e: any) => e.id === elementId);
        if (element) return element;
      }
      current = current.parent;
    }
    return null;
  }

  private updateCursor(hoverElem?: any) {
    const domEl = this.world.renderer?.three.domElement.parentElement;
    if (!domEl) return;
    const canPickDevice = !this.targetDevice && hoverElem && this.config.isValidDevice(hoverElem);
    const canPickTarget = !!this.targetDevice && hoverElem && this.config.isValidTarget(hoverElem);
    domEl.style.cursor = canPickDevice || canPickTarget ? "copy" : "crosshair";
  }

  private restoreHighlights() {
    this.restoreHighlightMap(this.deviceHighlights);
    this.restoreHighlightMap(this.targetHighlights);
  }

  private restoreHighlightMap(map: Map<THREE.Mesh, THREE.Material | THREE.Material[]>) {
    for (const [mesh, original] of map.entries()) {
      if (mesh.material && mesh.material !== original) {
        const current = mesh.material;
        if (Array.isArray(current)) current.forEach((mat) => mat.dispose());
        else current.dispose();
      }
      mesh.material = original;
    }
    map.clear();
  }

  private highlightDevices() {
    this.restoreHighlightMap(this.deviceHighlights);
    const highlightMat = new THREE.MeshStandardMaterial({
      color: this.config.deviceColor ?? 0x38bdf8,
      emissive: 0x06243a,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.82,
    });

    for (const obj of this.config.collectDeviceMeshes()) {
      const mesh = obj as THREE.Mesh;
      if (this.deviceHighlights.has(mesh)) continue;
      this.deviceHighlights.set(mesh, mesh.material);
      mesh.material = highlightMat.clone();
    }
    highlightMat.dispose();
  }

  private highlightTargets() {
    this.restoreHighlightMap(this.targetHighlights);
    const highlightMat = new THREE.MeshStandardMaterial({
      color: this.config.targetColor ?? 0xfbbf24,
      emissive: 0x3d2600,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.8,
    });

    for (const obj of this.config.collectTargetMeshes()) {
      const mesh = obj as THREE.Mesh;
      if (this.targetHighlights.has(mesh)) continue;
      this.targetHighlights.set(mesh, mesh.material);
      mesh.material = highlightMat.clone();
    }
    highlightMat.dispose();
  }

  private ensureTooltip() {
    if (this.tooltip) return this.tooltip;

    this.tooltip = document.createElement("div");
    this.tooltip.id = `${this.config.id}-connect-flow-tooltip`;
    Object.assign(this.tooltip.style, {
      position: "fixed",
      zIndex: "10000",
      display: "none",
      pointerEvents: "none",
      maxWidth: "280px",
      padding: "8px 10px",
      borderRadius: "8px",
      background: "rgba(15, 23, 42, 0.93)",
      border: "1px solid rgba(34, 211, 238, 0.32)",
      color: "#e2e8f0",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "11px",
      boxShadow: "0 12px 28px rgba(0, 0, 0, 0.3)",
      backdropFilter: "blur(10px)",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.tooltip);
    return this.tooltip;
  }

  private hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = "none";
    }
  }

  private removeTooltip() {
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  private showTooltip(event: MouseEvent, hoverElem?: any) {
    const tooltip = this.ensureTooltip();
    const keyStyle = "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;font-weight:800;color:#e2e8f0;background:rgba(15,23,42,0.95);border:1px solid rgba(148,163,184,0.35);border-radius:3px;padding:1px 4px;";
    const chipStyle = "display:inline-flex;align-items:center;gap:4px;padding:2px 5px;border-radius:4px;background:rgba(148,163,184,0.12);color:#cbd5e1;white-space:nowrap;";
    
    const texts = this.config.tooltipPhaseTexts;
    const phaseTitle = this.targetDevice ? texts.title2 : texts.title1;
    const mainAction = this.targetDevice
      ? (hoverElem && this.config.isValidTarget(hoverElem) ? texts.hoverAction2 : texts.action2)
      : (hoverElem && this.config.isValidDevice(hoverElem) ? texts.hoverAction1 : texts.action1);
    const detail = this.targetDevice ? texts.detail2 : texts.detail1;
    const footer = this.targetDevice ? (texts.footer2 || "") : (texts.footer1 || "");

    tooltip.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <span style="color:#22d3ee;font-weight:800;">${phaseTitle}</span>
          <span style="color:#94a3b8;">${texts.deviceLabel}</span>
        </div>
        <div style="color:#e2e8f0;font-weight:700;">${mainAction}</div>
        <div style="color:#94a3b8;line-height:1.35;">${detail}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          <span style="${chipStyle}"><span style="${keyStyle}">ЛКМ</span> выбрать</span>
          <span style="${chipStyle}"><span style="${keyStyle}">Esc</span> выйти</span>
          ${footer ? `<span style="${chipStyle}"><span style="${keyStyle}">узел</span> ${footer}</span>` : ""}
        </div>
      </div>
    `;
    tooltip.style.display = "block";
    const left = Math.min(event.clientX + 16, window.innerWidth - 300);
    const top = Math.min(event.clientY + 16, window.innerHeight - 170);
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }
}
