import {
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Color,
  BackSide,
  DoubleSide,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";

import { drawFallback, isSoftwareRenderer } from "./avatar-fallback";
import { advanceMotion, createMotion } from "./avatar-motion";
import { applyPose, createAvatarMaterials, createAvatarModel } from "./avatar-model";
import { shapeOf } from "./avatar-shapes";
import type {
  AvatarHandle,
  AvatarLook,
  AvatarMaterials,
  AvatarModel,
  AvatarMotion,
  BotMood,
  MotionInput,
} from "./types";

const SIDE = 256;
const INITIAL_ATLAS = SIDE * 2;
const MAX_ATLAS = SIDE * 4;
const MIN_PIXELS = 8;

type Entry = {
  canvas: HTMLCanvasElement;
  color: string;
  context: CanvasRenderingContext2D;
  model: AvatarModel;
  motion: AvatarMotion;
  mood: BotMood;
  visible: boolean;
  dirty: boolean;
  follow: boolean;
  steady: boolean;
  pixels: number;
  centerX: number | null;
  centerY: number | null;
};

type PlacedEntry = {
  entry: Entry;
  x: number;
  y: number;
  size: number;
};

type Stage = {
  renderer: WebGLRenderer;
  atlasSize: number;
  scene: Scene;
  camera: PerspectiveCamera;
  materials: AvatarMaterials;
  entries: Map<HTMLCanvasElement, Entry>;
  observer: IntersectionObserver | null;
  resizeObserver: ResizeObserver | null;
  frame: number | null;
  active: boolean;
  last: number;
  time: number;
  reduced: MediaQueryList;
  rectsDirty: boolean;
  viewportWidth: number;
  viewportHeight: number;
};

const pointer = { x: 0, y: 0, moved: false };

let stage: Stage | null | undefined;

const hash = (value: number) => {
  let state = Math.imul(Math.floor(value) + 0x6d2b79f5, 0x9e3779b1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

function toPixels(cssWidth: number) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  return Math.min(SIDE, Math.max(MIN_PIXELS, Math.round(cssWidth * ratio)));
}

function environment(renderer: WebGLRenderer) {
  const scene = new Scene();
  const domeGeo = new SphereGeometry(12, 32, 16);
  const domeMat = new ShaderMaterial({
    side: BackSide,
    vertexShader:
      "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader:
      "varying vec3 p; void main(){ vec3 top = vec3(0.96,0.98,1.0); vec3 bottom = vec3(0.70,0.76,0.88); gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.7, 0.8, p.y)), 1.0); }",
  });
  scene.add(new Mesh(domeGeo, domeMat));

  const disposables: { dispose(): void }[] = [domeGeo, domeMat];

  for (const [x, y, z, width, height, power] of [
    [-5, 6, 6, 7, 5, 3.2],
    [7, 2, 4, 4, 6, 1.2],
    [0, -6, 3, 8, 3, 0.8],
  ] as const) {
    const geo = new PlaneGeometry(width, height);
    const mat = new MeshBasicMaterial({ color: new Color().setScalar(power), side: DoubleSide });
    disposables.push(geo, mat);
    const panel = new Mesh(geo, mat);
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
  }

  const generator = new PMREMGenerator(renderer);
  const texture = generator.fromScene(scene, 0.04).texture;
  generator.dispose();

  for (const item of disposables) item.dispose();

  return texture;
}

function createStage(): Stage {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, stencil: false });
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");

  if (info && isSoftwareRenderer(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)))) {
    renderer.dispose();
    throw new Error("WebGL is drawn by software");
  }

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  renderer.setSize(INITIAL_ATLAS, INITIAL_ATLAS, false);
  renderer.setScissorTest(true);

  const camera = new PerspectiveCamera(28, 1, 0.1, 60);
  camera.position.set(0, 0.5, 11.6);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.matrixAutoUpdate = false;

  const scene = new Scene();
  const key = new DirectionalLight(0xfff4ea, 1.15);
  key.position.set(-3, 5, 7);
  const fill = new DirectionalLight(0xbdd7ff, 0.45);
  fill.position.set(5, 1, 4);
  const hemi = new HemisphereLight(0xffffff, 0xc4d4f0, 0.55);

  for (const light of [key, fill, hemi]) {
    light.updateMatrix();
    light.updateMatrixWorld(true);
    light.matrixAutoUpdate = false;
  }

  scene.add(key, fill, hemi);

  const entries = new Map<HTMLCanvasElement, Entry>();

  const onPointerMove = (event: PointerEvent) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.moved = true;
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((changes) => {
          for (const change of changes) {
            const entry = entries.get(change.target as HTMLCanvasElement);

            if (!entry) continue;

            entry.visible = change.isIntersecting;
            entry.dirty = true;
            entry.centerX = null;
            entry.centerY = null;
          }

          if (stage) stage.rectsDirty = true;

          schedule();
        });

  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((changes) => {
          for (const change of changes) {
            const entry = entries.get(change.target as HTMLCanvasElement);

            if (!entry) continue;

            const width = change.contentRect.width;

            if (width > 0) entry.pixels = toPixels(width);

            entry.dirty = true;
            entry.centerX = null;
            entry.centerY = null;
          }

          if (stage) stage.rectsDirty = true;

          schedule();
        });

  const created: Stage = {
    renderer,
    atlasSize: INITIAL_ATLAS,
    scene,
    camera,
    materials: createAvatarMaterials(environment(renderer)),
    entries,
    observer,
    resizeObserver,
    frame: null,
    active: false,
    last: performance.now(),
    time: 0,
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)"),
    rectsDirty: true,
    viewportWidth: window.innerWidth || 1,
    viewportHeight: window.innerHeight || 1,
  };

  const onScroll = () => {
    created.rectsDirty = true;
  };

  const onResize = () => {
    created.viewportWidth = window.innerWidth || 1;
    created.viewportHeight = window.innerHeight || 1;
    created.rectsDirty = true;

    for (const entry of entries.values()) {
      const width = entry.canvas.clientWidth;

      if (width > 0) entry.pixels = toPixels(width);

      entry.dirty = true;
    }

    schedule();
  };

  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("resize", onResize, { passive: true });

  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
    observer?.disconnect();
    resizeObserver?.disconnect();

    if (created.frame !== null) {
      cancelAnimationFrame(created.frame);
      created.frame = null;
    }

    created.active = false;
    stage = null;

    for (const entry of entries.values()) {
      entry.visible = false;
      drawFallback(entry.canvas, entry.color);
    }

    entries.clear();
  });

  return created;
}

function ensureStage() {
  if (stage !== undefined) return stage;

  try {
    stage = createStage();
  } catch {
    stage = null;
  }

  return stage;
}

function refreshRects(current: Stage, list: Entry[]) {
  if (!pointer.moved) return;

  const refreshAll = current.rectsDirty;

  for (const entry of list) {
    if (!entry.follow) continue;

    if (!refreshAll && entry.centerX !== null && entry.centerY !== null) continue;

    const rect = entry.canvas.getBoundingClientRect();
    entry.centerX = rect.left + rect.width / 2;
    entry.centerY = rect.top + rect.height / 2;
  }

  current.rectsDirty = false;
}

function inputOf(current: Stage, entry: Entry, reduced: boolean): MotionInput {
  if (!entry.follow || !pointer.moved || entry.centerX === null || entry.centerY === null) {
    return { mood: entry.mood, pointer: null, reduced, steady: entry.steady };
  }

  const dx = (pointer.x - entry.centerX) / (current.viewportWidth * 0.5);
  const dy = (pointer.y - entry.centerY) / (current.viewportHeight * 0.5);
  return {
    mood: entry.mood,
    pointer: { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) },
    reduced,
    steady: entry.steady,
  };
}

function packBatch(
  entries: Entry[],
  startIndex: number,
  atlasSize: number,
): { placed: PlacedEntry[]; nextIndex: number } {
  const placed: PlacedEntry[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let index = startIndex;

  while (index < entries.length) {
    const entry = entries[index]!;
    const size = entry.pixels > 0 ? entry.pixels : MIN_PIXELS;

    if (cursorX + size > atlasSize) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }

    if (cursorY + size > atlasSize) break;

    placed.push({ entry, x: cursorX, y: cursorY, size });
    cursorX += size;

    if (size > rowHeight) rowHeight = size;

    index++;
  }

  return { placed, nextIndex: index };
}

function renderPass(current: Stage, placed: PlacedEntry[]) {
  const { renderer, scene, camera, atlasSize } = current;
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.setScissorTest(true);

  for (const item of placed) {
    const { entry, x, y, size } = item;
    current.materials.wobble.value = entry.model.wobble;
    renderer.setViewport(x, y, size, size);
    renderer.setScissor(x, y, size, size);
    scene.add(entry.model.root);
    renderer.render(scene, camera);
    scene.remove(entry.model.root);
  }

  for (const item of placed) {
    const { entry, x, y, size } = item;

    if (entry.canvas.width !== size || entry.canvas.height !== size) {
      entry.canvas.width = size;
      entry.canvas.height = size;
    }

    entry.context.clearRect(0, 0, size, size);
    entry.context.drawImage(
      renderer.domElement,
      x,
      atlasSize - y - size,
      size,
      size,
      0,
      0,
      size,
      size,
    );
  }
}

function tick(current: Stage, now: number) {
  current.frame = null;

  const dt = current.active ? Math.min(0.05, Math.max(0, (now - current.last) / 1000)) : 1 / 60;
  current.last = now;
  current.time += dt;
  current.materials.clock.value = current.time;

  const reduced = current.reduced.matches;
  const toDraw: Entry[] = [];
  let animating = false;

  for (const entry of current.entries.values()) {
    if (!entry.visible) continue;

    animating = true;

    if (reduced && !entry.dirty) continue;

    if (entry.pixels === 0) {
      const width = entry.canvas.clientWidth;

      if (width > 0) entry.pixels = toPixels(width);
    }

    entry.dirty = false;
    toDraw.push(entry);
  }

  if (toDraw.length > 0) {
    refreshRects(current, toDraw);

    for (const entry of toDraw) {
      applyPose(
        entry.model,
        advanceMotion(entry.motion, inputOf(current, entry, reduced), dt, current.time),
      );
    }

    let firstBatch = packBatch(toDraw, 0, current.atlasSize);

    if (firstBatch.nextIndex < toDraw.length && current.atlasSize < MAX_ATLAS) {
      current.atlasSize = MAX_ATLAS;
      current.renderer.setSize(MAX_ATLAS, MAX_ATLAS, false);
      firstBatch = packBatch(toDraw, 0, current.atlasSize);
    }

    renderPass(current, firstBatch.placed);

    let nextIndex = firstBatch.nextIndex;

    while (nextIndex < toDraw.length) {
      const batch = packBatch(toDraw, nextIndex, current.atlasSize);
      renderPass(current, batch.placed);
      nextIndex = batch.nextIndex;
    }
  }

  if (animating && !reduced) {
    current.active = true;
    schedule();
  } else {
    current.active = false;
  }
}

function schedule() {
  const current = stage;

  if (!current || current.frame !== null || current.entries.size === 0) return;

  current.frame = requestAnimationFrame((now) => tick(current, now));
}

export function mountAvatar(canvas: HTMLCanvasElement, look: AvatarLook): AvatarHandle | null {
  const current = ensureStage();
  const context = canvas.getContext("2d");

  if (!current || !context) return null;

  const seed = look.delayMs / 1000;
  const random = hash(look.delayMs + 1);
  const shape = shapeOf(look.family);
  const model = createAvatarModel(shape, look.color, current.materials, look.accessory ?? "none");
  const initialWidth = canvas.clientWidth;

  const entry: Entry = {
    canvas,
    color: look.color,
    context,
    model,
    motion: createMotion(seed, random, shape.name),
    mood: look.mood,
    visible: current.observer === null,
    dirty: true,
    follow: look.follow === true,
    steady: look.steady === true,
    pixels: initialWidth > 0 ? toPixels(initialWidth) : 0,
    centerX: null,
    centerY: null,
  };
  current.entries.set(canvas, entry);
  current.rectsDirty = true;
  current.observer?.observe(canvas);
  current.resizeObserver?.observe(canvas);
  schedule();

  return {
    setMood(mood) {
      entry.mood = mood;
      entry.dirty = true;
      schedule();
    },
    setOptions(options) {
      entry.follow = options.follow;
      entry.steady = options.steady;
      entry.centerX = null;
      entry.centerY = null;
      entry.dirty = true;
      current.rectsDirty = true;
      schedule();
    },
    dispose() {
      current.observer?.unobserve(canvas);
      current.resizeObserver?.unobserve(canvas);
      current.entries.delete(canvas);
      model.dispose();

      if (current.entries.size === 0 && current.frame !== null) {
        cancelAnimationFrame(current.frame);
        current.frame = null;
        current.active = false;
      }
    },
  };
}
