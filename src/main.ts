import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import * as TEMPLATES from "./ui-templates";
import { appIcons, CONTENT_GRID_ID } from "./globals";
import { viewportSettingsTemplate } from "./ui-templates/buttons/viewport-settings";
import workerUrl from "@thatopen/fragments/dist/Worker/worker.mjs?url";
import { DuctDrawingTool } from "./bim-components/DuctDrawingTool";
import { TerminalPlacementTool } from "./bim-components/TerminalPlacementTool";
import { EquipmentPlacementTool } from "./bim-components/EquipmentPlacementTool";
import { WallDrawingTool } from "./bim-components/WallDrawingTool";
import { TrayDrawingTool } from "./bim-components/TrayDrawingTool";
import { PipeDrawingTool } from "./bim-components/PipeDrawingTool";
import { ElectricalPlacementTool } from "./bim-components/ElectricalPlacementTool";
import { FittingGenerator } from "./bim-components/FittingGenerator";
import { Snapping } from "./bim-components/Snapping";


BUI.Manager.init();

// Components Setup

const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);

const world = worlds.create<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBF.PostproductionRenderer
>();

world.name = "Main";
world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = new THREE.Color(0x1a1d23);

const viewport = BUI.Component.create<BUI.Viewport>(() => {
  return BUI.html`<bim-viewport></bim-viewport>`;
});

world.renderer = new OBF.PostproductionRenderer(components, viewport);
world.camera = new OBC.OrthoPerspectiveCamera(components);
world.camera.threePersp.near = 0.01;
world.camera.threePersp.updateProjectionMatrix();
world.camera.controls.restThreshold = 0.05;

// Замедляем скорость перемещения, зума и поворота камеры для плавного проектирования
world.camera.controls.azimuthRotateSpeed = 0.4;
world.camera.controls.polarRotateSpeed = 0.4;
world.camera.controls.truckSpeed = 0.4;
world.camera.controls.dollySpeed = 0.4;

const worldGrid = components.get(OBC.Grids).create(world);
worldGrid.material.uniforms.uColor.value = new THREE.Color(0x494b50);
worldGrid.material.uniforms.uSize1.value = 0.1; // Сетка с шагом 100 мм для привязки
worldGrid.material.uniforms.uSize2.value = 1.0; // Основные линии каждые 1000 мм (1 м)

// Синхронизация визуальной сетки с текущей чертежной отметкой
window.addEventListener("elevation-updated", (event: any) => {
  const elevMm = event.detail.elevation ?? 0;
  if (worldGrid && worldGrid.three) {
    worldGrid.three.position.y = elevMm / 1000;
  }
  const label = document.getElementById("viewport-elevation-label");
  if (label) {
    const elevM = (elevMm / 1000).toFixed(3);
    label.innerText = (elevMm >= 0 ? "+" : "") + elevM;
  }
});


const resizeWorld = () => {
  world.renderer?.resize();
  world.camera.updateAspect();
};

viewport.addEventListener("resize", resizeWorld);

world.dynamicAnchor = false;

components.init();

// Инициализация инструмента рисования воздуховодов
const projectElements: any[] = [];
const ductDrawingTool = new DuctDrawingTool(components, world);
ductDrawingTool.setElements(projectElements, () => {
  console.log("Elements updated, count:", projectElements.length);
  window.dispatchEvent(new CustomEvent("elements-updated"));
});
(window as any).ductDrawingTool = ductDrawingTool;

// Инициализация инструмента рисования стен
const wallDrawingTool = new WallDrawingTool(components, world);
wallDrawingTool.setElements(projectElements, () => {
  console.log("Walls updated, count:", projectElements.length);
  window.dispatchEvent(new CustomEvent("elements-updated"));
});
(window as any).wallDrawingTool = wallDrawingTool;

// Инициализация инструмента рисования кабельных лотков
const trayDrawingTool = new TrayDrawingTool(components, world);
trayDrawingTool.setElements(projectElements, () => {
  console.log("Trays updated, count:", projectElements.length);
  window.dispatchEvent(new CustomEvent("elements-updated"));
});
(window as any).trayDrawingTool = trayDrawingTool;

// Инициализация инструмента рисования трубопроводов
const pipeDrawingTool = new PipeDrawingTool(components, world);
pipeDrawingTool.setElements(projectElements, () => {
  console.log("Pipes updated, count:", projectElements.length);
  window.dispatchEvent(new CustomEvent("elements-updated"));
});
(window as any).pipeDrawingTool = pipeDrawingTool;

// Инициализация инструмента размещения решеток и диффузоров
const terminalPlacementTool = new TerminalPlacementTool(components, world, ductDrawingTool);
terminalPlacementTool.setElements(projectElements, () => {
  console.log("Terminals updated, count:", projectElements.length);
  window.dispatchEvent(new CustomEvent("elements-updated"));
});
(window as any).terminalPlacementTool = terminalPlacementTool;

// Инициализация инструмента размещения оборудования
const equipmentPlacementTool = new EquipmentPlacementTool(components, world, ductDrawingTool);
equipmentPlacementTool.setElements(projectElements, () => {
  console.log("Equipment updated, count:", projectElements.length);
  window.dispatchEvent(new CustomEvent("elements-updated"));
});
(window as any).equipmentPlacementTool = equipmentPlacementTool;

// Инициализация инструмента размещения розеток, щитов и светильников
const electricalPlacementTool = new ElectricalPlacementTool(components, world, ductDrawingTool);
electricalPlacementTool.setElements(projectElements, () => {
  console.log("Electrical elements updated, count:", projectElements.length);
  window.dispatchEvent(new CustomEvent("elements-updated"));
});
(window as any).electricalPlacementTool = electricalPlacementTool;
(window as any).isPropertiesPanelOpen = false;



components.get(OBC.Raycasters).get(world);

const { postproduction } = world.renderer;
postproduction.enabled = true;
postproduction.style = OBF.PostproductionAspect.COLOR_SHADOWS;

const { aoPass, edgesPass } = world.renderer.postproduction;

edgesPass.color = new THREE.Color(0x494b50);

const aoParameters = {
  radius: 0.25,
  distanceExponent: 1,
  thickness: 1,
  scale: 1,
  samples: 16,
  distanceFallOff: 1,
  screenSpaceRadius: true,
};

const pdParameters = {
  lumaPhi: 10,
  depthPhi: 2,
  normalPhi: 3,
  radius: 4,
  radiusExponent: 1,
  rings: 2,
  samples: 16,
};

aoPass.updateGtaoMaterial(aoParameters);
aoPass.updatePdMaterial(pdParameters);

const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl);

fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
  const isLod = "isLodMaterial" in material && material.isLodMaterial;
  if (isLod) {
    world.renderer!.postproduction.basePass.isolatedMaterials.push(material);
  }
});

world.camera.projection.onChanged.add(() => {
  for (const [_, model] of fragments.list) {
    model.useCamera(world.camera.three);
  }
});

world.camera.controls.addEventListener("rest", () => {
  fragments.core.update(true);
});

const ifcLoader = components.get(OBC.IfcLoader);
const isProduction = window.location.pathname.startsWith("/zk");
const wasmPath = isProduction ? "/zk/web-ifc/" : "/web-ifc/";
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: { absolute: true, path: window.location.origin + wasmPath },
});

const highlighter = components.get(OBF.Highlighter);
highlighter.setup({
  world,
  selectMaterialDefinition: {
    color: new THREE.Color("#bcf124"),
    renderedFaces: 1,
    opacity: 1,
    transparent: false,
  },
});

// Clipper Setup
const clipper = components.get(OBC.Clipper);
window.addEventListener("keydown", (event) => {
  if (event.code === "Delete" || event.code === "Backspace") {
    clipper.delete(world);
  }
});

// Length Measurement Setup
const lengthMeasurer = components.get(OBF.LengthMeasurement);
lengthMeasurer.world = world;
lengthMeasurer.color = new THREE.Color("#6528d7");

lengthMeasurer.list.onItemAdded.add((line) => {
  const center = new THREE.Vector3();
  line.getCenter(center);
  const radius = line.distance() / 3;
  const sphere = new THREE.Sphere(center, radius);
  world.camera.controls.fitToSphere(sphere, true);
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Delete" || event.code === "Backspace") {
    lengthMeasurer.delete();
  }
});

// Area Measurement Setup
const areaMeasurer = components.get(OBF.AreaMeasurement);
areaMeasurer.world = world;
areaMeasurer.color = new THREE.Color("#6528d7");

areaMeasurer.list.onItemAdded.add((area) => {
  if (!area.boundingBox) return;
  const sphere = new THREE.Sphere();
  area.boundingBox.getBoundingSphere(sphere);
  world.camera.controls.fitToSphere(sphere, true);
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Enter" || event.code === "NumpadEnter") {
    areaMeasurer.endCreation();
  }
});

// Унифицированный обработчик двойного клика для измерительных инструментов
viewport.addEventListener("dblclick", () => {
  if (areaMeasurer.enabled) {
    areaMeasurer.endCreation();
  }
});

// Define what happens when a fragments model has been loaded
fragments.list.onItemSet.add(async ({ key, value: model }) => {
  model.useCamera(world.camera.three);
  model.getClippingPlanesEvent = () => {
    return Array.from(world.renderer!.three.clippingPlanes) || [];
  };

  const savedVisible = localStorage.getItem(`model_visible_${key}`);
  if (savedVisible !== null) {
    model.object.visible = savedVisible === "true";
  }

  // Восстанавливаем сохраненное смещение и поворот подложки (FR-IFC-CTX-2)
  const px = localStorage.getItem(`model_pos_x_${key}`);
  const py = localStorage.getItem(`model_pos_y_${key}`);
  const pz = localStorage.getItem(`model_pos_z_${key}`);
  const ry = localStorage.getItem(`model_rot_y_${key}`);
  
  if (px !== null) model.object.position.x = Number(px) / 1000;
  if (py !== null) model.object.position.y = Number(py) / 1000;
  if (pz !== null) model.object.position.z = Number(pz) / 1000;
  if (ry !== null) model.object.rotation.y = (Number(ry) * Math.PI) / 180;

  world.scene.three.add(model.object);
  await fragments.core.update(true);
  window.dispatchEvent(new CustomEvent("fragments-list-updated"));
});

// Функция для синхронизации всех трехмерных мешей (IFC и CAD) с мешами мира для работы измерителей и сечений
function rebuildWorldMeshes() {
  if (!world) return;
  world.meshes.clear();
  
  // 1. Добавляем меши всех загруженных и видимых IFC подложек.
  // ВАЖНО: у мешей IFC-фрагментов That Open позиция хранится на GPU и НЕ имеет
  // CPU-массива (`position.array === undefined`). Стандартный raycast (three-mesh-bvh),
  // который использует OBC-рейкастер измерений/сечения, на таких мешах ПАДАЕТ
  // (`Cannot read properties of undefined (reading '0')`) → инструменты «Длина/Площадь/
  // Сечение» молча перестают работать при загруженном IFC. Поэтому такие меши НЕ кладём
  // в world.meshes. (Измерение по самим воздуховодам/стенам — работает, у них CPU-геометрия.)
  for (const model of fragments.list.values()) {
    if (model.object && model.object.visible !== false) {
      model.object.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          (child.geometry as THREE.BufferGeometry)?.attributes?.position?.array
        ) {
          world.meshes.add(child);
        }
      });
    }
  }
  
  // 2. Добавляем меши всех нарисованных CAD элементов (воздуховоды, тройники, лотки, трубы, стены и т.д.)
  if (ductDrawingTool && ductDrawingTool.ductsGroup) {
    ductDrawingTool.ductsGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        world.meshes.add(child);
      }
    });
  }
  
  console.log(`World meshes populated: ${world.meshes.size} meshes total.`);
}

// Подписываемся на события обновления моделей и элементов для авто-синхронизации мешей
window.addEventListener("fragments-list-updated", rebuildWorldMeshes);
window.addEventListener("elements-updated", rebuildWorldMeshes);

// Viewport Layouts
const [viewportSettings] = BUI.Component.create(viewportSettingsTemplate, {
  components,
  world,
});

viewport.append(viewportSettings);

const [viewportGrid] = BUI.Component.create(TEMPLATES.viewportGridTemplate, {
  components,
  world,
});

viewport.append(viewportGrid);

// Отключаем стандартное контекстное меню на вьюпорте, чтобы правый клик работал как CAD-сброс
viewport.addEventListener("contextmenu", (e) => e.preventDefault());

// Единая система выбора кастомных 3D элементов (воздуховодов, фасонных изделий, решеток, вентустановок)
const selectionRaycaster = new THREE.Raycaster();
const selectionMouse = new THREE.Vector2();

let currentSelectedMesh: THREE.Object3D | null = null;

function highlightCustomMesh(mesh: THREE.Mesh) {
  clearCustomSelection();
  
  // Находим корневой меш элемента в ductsGroup, чтобы подсветить все его детали вместе
  let root: THREE.Object3D = mesh;
  const elementId = mesh.userData?.elementId;
  if (elementId) {
    while (root.parent && root.parent.userData?.elementId === elementId) {
      root = root.parent;
    }
  }
  
  currentSelectedMesh = root;
  
  // Создаем материал подсветки (салатовый цвет, соответствующий BIM-хайлайтеру)
  const highlightMat = new THREE.MeshStandardMaterial({
    color: 0xbcf124,
    roughness: 0.2,
    metalness: 0.8,
    emissive: 0x333300
  });
  
  // Подсвечиваем сам корневой элемент и все его дочерние меши рекурсивно
  root.traverse((node: any) => {
    if (node instanceof THREE.Mesh) {
      if (!node.userData.originalMaterial) {
        node.userData.originalMaterial = node.material;
      }
      node.material = highlightMat;
    }
  });

  // Центрируем вращение камеры вокруг выбранного кастомного элемента
  if (world && world.camera && world.camera.controls) {
    const box = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    box.getCenter(center);
    world.camera.controls.setTarget(center.x, center.y, center.z, true);
  }
}

function clearCustomSelection() {
  if (currentSelectedMesh) {
    // Рекурсивно восстанавливаем оригинальные материалы для всех дочерних мешей
    currentSelectedMesh.traverse((node: any) => {
      if (node instanceof THREE.Mesh && node.userData.originalMaterial) {
        node.material = node.userData.originalMaterial;
        delete node.userData.originalMaterial;
      }
    });
    
    currentSelectedMesh = null;
  }
  (window as any).selectedCustomElement = null;
  window.dispatchEvent(new CustomEvent("custom-element-selected", { detail: null }));
}

// Глобальный обработчик: Delete/Backspace — удаление выбранного элемента
window.addEventListener("keydown", (event) => {
  if (event.code !== "Delete" && event.code !== "Backspace") return;

  // Не перехватываем, если фокус в поле ввода
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

  const selected = (window as any).selectedCustomElement;
  if (!selected) return;

  const idx = projectElements.findIndex((e: any) => e.id === selected.id);
  if (idx === -1) return;

  projectElements.splice(idx, 1);

  const lineTypes = ["duct", "pipe", "tray", "wall", "fitting"];
  if (lineTypes.includes(selected.type)) {
    const updated = FittingGenerator.generateFittings(projectElements);
    projectElements.length = 0;
    projectElements.push(...updated);
  }

  ductDrawingTool.renderAll(projectElements);
  clearCustomSelection();
  window.dispatchEvent(new CustomEvent("custom-element-selected", { detail: null }));
  window.dispatchEvent(new CustomEvent("elements-updated"));
});

// Глобальный обработчик: стрелки — перемещение выбранного элемента
window.addEventListener("keydown", (event) => {
  const arrowKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  if (!arrowKeys.includes(event.key)) return;

  // Не перехватываем, если фокус в поле ввода
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

  const selected = (window as any).selectedCustomElement;
  if (!selected) return;

  event.preventDefault();

  // 100mm without Shift, 10mm with Shift (in meters: 0.1 / 0.01)
  const stepMm = event.shiftKey ? 10 : 100;
  let dxMm = 0;
  let dzMm = 0;

  if (event.key === "ArrowLeft")  dxMm = -stepMm;
  if (event.key === "ArrowRight") dxMm =  stepMm;
  if (event.key === "ArrowUp")    dzMm = -stepMm;
  if (event.key === "ArrowDown")  dzMm =  stepMm;

  // Find the element in projectElements (it may be a different object reference after FittingGenerator)
  const elem = projectElements.find((e: any) => e.id === selected.id);
  if (!elem) return;

  if (elem.position && Array.isArray(elem.position)) {
    // Positioned element
    elem.position[0] += dxMm;
    elem.position[2] += dzMm;
  } else if (elem.start && elem.end && Array.isArray(elem.start) && Array.isArray(elem.end)) {
    // Line element — move both endpoints
    elem.start[0] += dxMm;
    elem.start[2] += dzMm;
    elem.end[0]   += dxMm;
    elem.end[2]   += dzMm;
  } else {
    return;
  }

  // Regenerate fittings if needed
  const lineTypes = ["duct", "pipe", "tray"];
  if (lineTypes.includes(elem.type)) {
    const updated = FittingGenerator.generateFittings(projectElements);
    projectElements.length = 0;
    projectElements.push(...updated);
  }

  ductDrawingTool.renderAll(projectElements);
  window.dispatchEvent(new CustomEvent("elements-updated"));

  // Re-highlight the moved element mesh
  const movedId = selected.id;
  ductDrawingTool.ductsGroup.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh && child.userData?.elementId === movedId) {
      highlightCustomMesh(child);
      (window as any).selectedCustomElement = projectElements.find((e: any) => e.id === movedId) || selected;
      window.dispatchEvent(new CustomEvent("custom-element-selected", {
        detail: (window as any).selectedCustomElement
      }));
    }
  });
});

// Глобальный обработчик: [ / ] и Q / E — переключение активной отметки по этажам
window.addEventListener("keydown", (event) => {
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

  const keys = ["[", "]", "q", "e"];
  const key = event.key.toLowerCase();
  if (!keys.includes(key)) return;

  const levels = (window as any).projectLevels || {};
  const sortedLevels = Object.entries(levels)
    .map(([name, height]) => ({ name, height: Number(height) }))
    .sort((a, b) => a.height - b.height);

  if (sortedLevels.length === 0) return;

  const currentElevation = (window as any).drawingSettings?.currentElevation ?? 0;

  if (key === "[" || key === "q") {
    // Ищем ближайший уровень снизу
    let targetLevel = sortedLevels[0];
    for (let i = sortedLevels.length - 1; i >= 0; i--) {
      if (sortedLevels[i].height < currentElevation) {
        targetLevel = sortedLevels[i];
        break;
      }
    }
    const nextElev = targetLevel.height;
    if (!(window as any).drawingSettings) (window as any).drawingSettings = {};
    (window as any).drawingSettings.currentElevation = nextElev;
    window.dispatchEvent(new CustomEvent("elevation-updated", { detail: { elevation: nextElev } }));
    window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
  } 
  else if (key === "]" || key === "e") {
    // Ищем ближайший уровень сверху
    let targetLevel = sortedLevels[sortedLevels.length - 1];
    for (let i = 0; i < sortedLevels.length; i++) {
      if (sortedLevels[i].height > currentElevation) {
        targetLevel = sortedLevels[i];
        break;
      }
    }
    const nextElev = targetLevel.height;
    if (!(window as any).drawingSettings) (window as any).drawingSettings = {};
    (window as any).drawingSettings.currentElevation = nextElev;
    window.dispatchEvent(new CustomEvent("elevation-updated", { detail: { elevation: nextElev } }));
    window.dispatchEvent(new CustomEvent("drawing-settings-external-updated"));
  }
});


// Слушатель клика для выбора элементов и расстановки пометок
viewport.addEventListener("pointerdown", (event) => {
  if ((window as any).notePlacementActive) {
    if (event.button !== 0) return; // Только левый клик

    const rect = viewport.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), world.camera.three);

    const targetPoint = new THREE.Vector3();
    const ifcIntersect = Snapping.getIfcIntersection(raycaster, fragments);
    
    if (ifcIntersect) {
      targetPoint.copy(ifcIntersect.point);
    } else {
      const meshes: THREE.Object3D[] = [];
      ductDrawingTool.ductsGroup.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) meshes.push(child);
      });
      const intersects = raycaster.intersectObjects(meshes, true);
      if (intersects.length > 0) {
        targetPoint.copy(intersects[0].point);
      } else {
        const hPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -((window as any).drawingSettings?.currentElevation || 0) / 1000);
        if (!raycaster.ray.intersectPlane(hPlane, targetPoint)) {
          return;
        }
      }
    }

    // Плавающий ввод текста пометки прямо в точке клика (вместо window.prompt —
    // он неудобен и в ряде окружений/прод глушится, из-за чего пометка не создавалась).
    const screenX = event.clientX;
    const screenY = event.clientY;
    const pos: [number, number, number] = [
      Math.round(targetPoint.x * 1000),
      Math.round(targetPoint.y * 1000),
      Math.round(targetPoint.z * 1000),
    ];

    // Один клик = одна пометка: сразу выходим из режима размещения
    (window as any).notePlacementActive = false;
    viewport.style.cursor = "default";
    window.dispatchEvent(new CustomEvent("project-notes-updated"));

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Текст пометки · Enter — ок, Esc — отмена";
    Object.assign(input.style, {
      position: "fixed",
      left: `${screenX}px`,
      top: `${screenY}px`,
      zIndex: "10000",
      width: "260px",
      padding: "6px 10px",
      fontSize: "13px",
      borderRadius: "6px",
      border: "1px solid #3b82f6",
      background: "#22262c",
      color: "#e5e7eb",
      boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
      outline: "none",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(input);
    setTimeout(() => input.focus(), 0);

    let done = false;
    const cleanup = () => {
      if (input.parentElement) input.parentElement.removeChild(input);
    };
    const commit = () => {
      if (done) return;
      done = true;
      const text = input.value.trim();
      cleanup();
      if (!text) return;
      const noteEl = {
        id: "note_" + Math.random().toString(36).substr(2, 9),
        type: "note",
        position: pos,
        text,
        author: "Инженер",
        createdAt: new Date().toLocaleString(),
      };
      projectElements.push(noteEl);
      ductDrawingTool.renderAll(projectElements);
      window.dispatchEvent(new CustomEvent("elements-updated"));
      window.dispatchEvent(new CustomEvent("project-notes-updated"));
    };
    const cancel = () => {
      if (done) return;
      done = true;
      cleanup();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // не триггерим горячие клавиши сцены во время ввода
      if (e.key === "Enter") commit();
      else if (e.key === "Escape") cancel();
    });
    input.addEventListener("blur", commit);
    return;
  }

  const ductTool = (window as any).ductDrawingTool;
  const wallTool = (window as any).wallDrawingTool;
  const terminalTool = (window as any).terminalPlacementTool;
  const equipmentTool = (window as any).equipmentPlacementTool;
  const trayTool = (window as any).trayDrawingTool;
  const pipeTool = (window as any).pipeDrawingTool;
  const electricalTool = (window as any).electricalPlacementTool;
  
  // Если активен какой-либо инструмент черчения/размещения, клик обрабатывается самим инструментом
  if (
    (ductTool && ductTool.enabled) ||
    (wallTool && wallTool.enabled) ||
    (terminalTool && terminalTool.enabled) ||
    (equipmentTool && equipmentTool.enabled) ||
    (trayTool && trayTool.enabled) ||
    (pipeTool && pipeTool.enabled) ||
    (electricalTool && electricalTool.enabled)
  ) {
    return;
  }

  // Если активны измерительные инструменты или сечение, обрабатываем клик и выходим
  if (clipper.enabled) {
    if (event.button === 0) {
      clipper.create(world);
    }
    return;
  }

  if (lengthMeasurer.enabled) {
    if (event.button === 0) {
      lengthMeasurer.create();
    }
    return;
  }

  if (areaMeasurer.enabled) {
    if (event.button === 0) {
      areaMeasurer.create();
    }
    return;
  }

  
  // Обрабатываем только левый клик для выбора
  if (event.button !== 0) return;
  
  const dom = world.renderer?.three.domElement;
  if (!dom) return;
  
  const rect = dom.getBoundingClientRect();
  selectionMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  selectionMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  selectionRaycaster.setFromCamera(selectionMouse, world.camera.three);
  
  // Собираем все меши из группы воздуховодов
  const meshes: THREE.Object3D[] = [];
  if (ductTool && ductTool.ductsGroup) {
    ductTool.ductsGroup.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        meshes.push(child);
      }
    });
  }
  
  const intersects = selectionRaycaster.intersectObjects(meshes);
  if (intersects.length > 0) {
    const selectedMesh = intersects[0].object as THREE.Mesh;
    let elementId = selectedMesh.userData?.elementId;
    
    // Если кликнули по детали сложной группы (например, патрубку оборудования)
    if (!elementId && selectedMesh.parent) {
      elementId = selectedMesh.parent.userData?.elementId;
    }
    
    if (elementId && ductTool.projectElements) {
      const element = ductTool.projectElements.find((e: any) => e.id === elementId);
      if (element) {
        console.log("Selected custom element:", element);

        // Сначала подсветка (внутри сбрасывается предыдущий выбор и шлётся null-событие),
        // и только ПОТОМ фиксируем выбранный элемент — иначе clearCustomSelection обнулит его.
        highlightCustomMesh(selectedMesh);

        (window as any).selectedCustomElement = element;

        // Очищаем стандартное IFC выделение, чтобы не было конфликтов
        const highlighter = components.get(OBF.Highlighter);
        highlighter.clear("select");

        // Отправляем событие выбора
        window.dispatchEvent(new CustomEvent("custom-element-selected", { detail: element }));
        return;
      }
    }
  }
  
  // Если кликнули в пустоту
  clearCustomSelection();
});

// Content Grid Setup
const viewportCardTemplate = () => BUI.html`
  <div class="dashboard-card" style="padding: 0px; position: relative;">
    ${viewport}
    <div style="position: absolute; bottom: 1rem; right: 1rem; background: rgba(24, 27, 31, 0.85); border: 1px solid var(--border, #2e333b); color: #dde1e7; padding: 0.3rem 0.6rem; border-radius: 4px; font-family: monospace; font-size: 0.85rem; pointer-events: none; z-index: 10; display: flex; align-items: center; gap: 0.35rem; box-shadow: var(--sh-sm, 0 2px 8px rgba(0,0,0,.28));">
      <span style="opacity: 0.7;">Отметка:</span>
      <span id="viewport-elevation-label" style="font-weight: bold; color: var(--c-bim, #178a99);">+0.000</span>
      <span style="opacity: 0.7;">м</span>
    </div>
  </div>
`;

const [contentRoot] = BUI.Component.create<
  BUI.Grid<TEMPLATES.ContentGridLayouts, TEMPLATES.ContentGridElements>,
  TEMPLATES.ContentGridState
>(TEMPLATES.contentGridTemplate, {
  components,
  world,
  id: CONTENT_GRID_ID,
  viewportTemplate: viewportCardTemplate,
});

// Шаблон оборачивает <bim-grid> в контейнер (для выезжающей панели свойств),
// поэтому корень компонента — это div, а не сетка. Достаём настоящую <bim-grid>
// изнутри — именно у неё есть .layouts/.layout. Fallback на корень, если обёртки нет.
const contentGrid =
  ((contentRoot.querySelector(`#${CONTENT_GRID_ID}`) as BUI.Grid<
    TEMPLATES.ContentGridLayouts,
    TEMPLATES.ContentGridElements
  > | null) ?? contentRoot);

const setInitialLayout = () => {
  if (window.location.hash) {
    const hash = window.location.hash.slice(
      1,
    ) as TEMPLATES.ContentGridLayouts[number];
    if (Object.keys(contentGrid.layouts).includes(hash)) {
      contentGrid.layout = hash;
    } else {
      contentGrid.layout = "Viewer";
      window.location.hash = "Viewer";
    }
  } else {
    window.location.hash = "Viewer";
    contentGrid.layout = "Viewer";
  }
};

setInitialLayout();

contentGrid.addEventListener("layoutchange", () => {
  window.location.hash = contentGrid.layout as string;
});

const contentGridIcons: Record<TEMPLATES.ContentGridLayouts[number], string> = {
  Viewer: appIcons.MODEL,
};

// App Grid Setup
type AppLayouts = ["App"];

type Sidebar = {
  name: "sidebar";
  state: TEMPLATES.GridSidebarState;
};

type ContentGrid = { name: "contentGrid"; state: TEMPLATES.ContentGridState };

type AppGridElements = [Sidebar, ContentGrid];

const app = document.getElementById("app") as BUI.Grid<
  AppLayouts,
  AppGridElements
>;

app.elements = {
  sidebar: {
    template: TEMPLATES.gridSidebarTemplate,
    initialState: {
      grid: contentGrid,
      compact: true,
      layoutIcons: contentGridIcons,
    },
  },
  contentGrid: contentRoot,
};

contentGrid.addEventListener("layoutchange", () =>
  app.updateComponent.sidebar(),
);

app.layouts = {
  App: {
    template: `
      "sidebar contentGrid" 1fr
      /auto 1fr
    `,
  },
};

app.layout = "App";

// Trigger a window resize to re-fit the viewport rendering under the header
setTimeout(() => {
  window.dispatchEvent(new Event("resize"));
}, 100);
