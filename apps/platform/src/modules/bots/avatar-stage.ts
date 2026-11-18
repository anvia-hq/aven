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
const MIN_PIXELS = 8;

type Entry = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  model: AvatarModel;
  motion: AvatarMotion;
  mood: BotMood;
  visible: boolean;
  dirty: boolean;
};

type Stage = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  materials: AvatarMaterials;
  entries: Set<Entry>;
  observer: IntersectionObserver | null;
  frame: number | null;
  last: number;
  time: number;
  reduced: MediaQueryList;
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

function environment(renderer: WebGLRenderer) {
  const scene = new Scene();
  scene.add(
    new Mesh(
      new SphereGeometry(12, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        vertexShader:
          "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "varying vec3 p; void main(){ vec3 top = vec3(0.96,0.98,1.0); vec3 bottom = vec3(0.70,0.76,0.88); gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.7, 0.8, p.y)), 1.0); }",
      }),
    ),
  );

  for (const [x, y, z, width, height, power] of [
    [-5, 6, 6, 7, 5, 3.2],
    [7, 2, 4, 4, 6, 1.2],
    [0, -6, 3, 8, 3, 0.8],
  ] as const) {
    const panel = new Mesh(
      new PlaneGeometry(width, height),
      new MeshBasicMaterial({ color: new Color().setScalar(power), side: DoubleSide }),
    );
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
  }

  const generator = new PMREMGenerator(renderer);
  const texture = generator.fromScene(scene, 0.04).texture;
  generator.dispose();
  return texture;
}

function createStage(): Stage {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  renderer.setSize(SIDE, SIDE, false);
  renderer.setScissorTest(true);

  const camera = new PerspectiveCamera(28, 1, 0.1, 60);
  camera.position.set(0, 0.5, 11.6);
  camera.lookAt(0, 0, 0);

  const scene = new Scene();
  const key = new DirectionalLight(0xfff4ea, 1.15);
  key.position.set(-3, 5, 7);
  const fill = new DirectionalLight(0xbdd7ff, 0.45);
  fill.position.set(5, 1, 4);
  scene.add(key, fill, new HemisphereLight(0xffffff, 0xc4d4f0, 0.55));

  window.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.moved = true;
  });

  const entries = new Set<Entry>();
  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((changes) => {
          for (const change of changes) {
            for (const entry of entries) {
              if (entry.canvas !== change.target) continue;

              entry.visible = change.isIntersecting;
              entry.dirty = true;
            }
          }

          schedule();
        });

  return {
    renderer,
    scene,
    camera,
    materials: createAvatarMaterials(environment(renderer)),
    entries,
    observer,
    frame: null,
    last: performance.now(),
    time: 0,
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)"),
  };
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

function inputOf(entry: Entry, reduced: boolean): MotionInput {
  if (!pointer.moved) return { mood: entry.mood, pointer: null, reduced };

  const rect = entry.canvas.getBoundingClientRect();
  const dx = (pointer.x - (rect.left + rect.width / 2)) / (window.innerWidth * 0.5);
  const dy = (pointer.y - (rect.top + rect.height / 2)) / (window.innerHeight * 0.5);
  return {
    mood: entry.mood,
    pointer: { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) },
    reduced,
  };
}

function draw(current: Stage, entry: Entry, dt: number) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixels = Math.min(SIDE, Math.max(MIN_PIXELS, Math.round(entry.canvas.clientWidth * ratio)));

  if (entry.canvas.width !== pixels || entry.canvas.height !== pixels) {
    entry.canvas.width = pixels;
    entry.canvas.height = pixels;
  }

  applyPose(
    entry.model,
    advanceMotion(entry.motion, inputOf(entry, current.reduced.matches), dt, current.time),
  );

  const { renderer } = current;
  renderer.setViewport(0, 0, pixels, pixels);
  renderer.setScissor(0, 0, pixels, pixels);
  renderer.clear();
  entry.model.root.visible = true;
  renderer.render(current.scene, current.camera);
  entry.model.root.visible = false;

  entry.context.clearRect(0, 0, pixels, pixels);
  entry.context.drawImage(
    renderer.domElement,
    0,
    SIDE - pixels,
    pixels,
    pixels,
    0,
    0,
    pixels,
    pixels,
  );
}

function tick(current: Stage, now: number) {
  current.frame = null;

  const dt = Math.min(0.05, (now - current.last) / 1000);
  current.last = now;
  current.time += dt;
  current.materials.clock.value = current.time;

  let drawn = false;

  for (const entry of current.entries) {
    if (!entry.visible) continue;

    if (current.reduced.matches && !entry.dirty) continue;

    entry.dirty = false;
    draw(current, entry, dt);
    drawn = true;
  }

  if (drawn || current.entries.size > 0) schedule();
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
  const model = createAvatarModel(shapeOf(look.family), look.color, current.materials);
  current.scene.add(model.root);

  const entry: Entry = {
    canvas,
    context,
    model,
    motion: createMotion(seed, random),
    mood: look.mood,
    visible: current.observer === null,
    dirty: true,
  };
  current.entries.add(entry);
  current.observer?.observe(canvas);
  schedule();

  return {
    setMood(mood) {
      entry.mood = mood;
      entry.dirty = true;
      schedule();
    },
    dispose() {
      current.observer?.unobserve(canvas);
      current.entries.delete(entry);
      current.scene.remove(model.root);
      model.dispose();
    },
  };
}
