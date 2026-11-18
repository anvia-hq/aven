import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

import { useReducedMotion } from "@/modules/bots/hooks/use-reduced-motion";

const MARK_PATH =
  "M475 367H896A42 42 0 0 1 938 409V826A42 42 0 0 1 896 868H820A42 42 0 0 1 778 826V778A40 40 0 0 0 738 738H515A40 40 0 0 0 475 778V826A42 42 0 0 1 433 868H338A42 42 0 0 1 296 826V527A42 42 0 0 1 338 485H390A43 43 0 0 0 433 442V409A42 42 0 0 1 475 367ZM513 487H740A38 38 0 0 1 778 525V596A38 38 0 0 1 740 634H513A38 38 0 0 1 475 596V525A38 38 0 0 1 513 487Z";

const FOV = 30;

function markGeometry() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${MARK_PATH}"/></svg>`;
  const shapes = new SVGLoader().parse(svg).paths.flatMap((path) => SVGLoader.createShapes(path));
  const geometry = new ExtrudeGeometry(shapes, {
    depth: 70,
    curveSegments: 28,
    bevelEnabled: true,
    bevelThickness: 14,
    bevelSize: 12,
    bevelSegments: 8,
  });
  geometry.scale(0.01, -0.01, 0.01);
  geometry.center();
  geometry.computeBoundingBox();
  return geometry;
}

function coreGeometry(source: ExtrudeGeometry) {
  const core = source.clone();
  core.scale(0.72, 0.72, 0.4);
  const positions = core.getAttribute("position");
  const colors: number[] = [];
  const low = new Color(0x1fb8a6);
  const high = new Color(0x6a8cff);
  const mix = new Color();

  for (let index = 0; index < positions.count; index++) {
    mix.copy(low).lerp(high, (positions.getX(index) + 3.2) / 6.4);
    colors.push(mix.r, mix.g, mix.b);
  }

  core.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return core;
}

export function GlassMark() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const element = canvas.current;

    if (!element) return;

    const made = (() => {
      try {
        return new WebGLRenderer({ canvas: element, antialias: true, alpha: true });
      } catch {
        return undefined;
      }
    })();

    if (!made) return;

    const renderer = made;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new Scene();
    const environment = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = environment.fromScene(room, 0.04).texture;
    scene.environmentIntensity = 0.9;

    const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);

    const geometry = markGeometry();
    const bounds = geometry.boundingBox;
    const width = bounds ? bounds.max.x - bounds.min.x : 6.4;
    const height = bounds ? bounds.max.y - bounds.min.y : 5;

    const glass = new MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1,
      thickness: 1.4,
      ior: 1.5,
      dispersion: 2.6,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      specularIntensity: 1,
      envMapIntensity: 1.5,
      attenuationColor: new Color(0x5fe0d0),
      attenuationDistance: 4,
    });

    const core = coreGeometry(geometry);
    const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });

    const group = new Group();
    const inner = new Mesh(core, glow);
    inner.position.z = -0.9;
    group.add(inner, new Mesh(geometry, glass));
    scene.add(group);

    const light = new DirectionalLight(0xffffff, 2.2);
    scene.add(light);

    const pointer = { x: 0, y: 0 };
    const onPointer = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };

    const size = () => {
      const { clientWidth, clientHeight } = element;
      renderer.setSize(clientWidth, clientHeight, false);
      const aspect = clientWidth / Math.max(clientHeight, 1);
      camera.aspect = aspect;
      const visible = Math.max(height * 1.35, (width * 1.35) / aspect);
      camera.position.set(0, 0, visible / (2 * Math.tan((FOV * Math.PI) / 360)));
      camera.updateProjectionMatrix();
    };

    let frame = 0;
    let visible = true;

    const draw = (time: number) => {
      const t = reduced ? 0 : time / 1000;
      group.rotation.y = Math.sin(t * 0.5) * 0.35 + pointer.x * 0.3;
      group.rotation.x = Math.sin(t * 0.35) * 0.08 + pointer.y * 0.15;
      light.position.set(Math.sin(t * 0.6) * 6, 4, 5);
      renderer.render(scene, camera);
    };

    const loop = (time: number) => {
      if (visible) draw(time);

      frame = requestAnimationFrame(loop);
    };

    size();
    draw(0);

    const resize = new ResizeObserver(() => {
      size();
      draw(performance.now());
    });
    resize.observe(element);

    const watch = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    watch.observe(element);

    if (!reduced) {
      window.addEventListener("pointermove", onPointer);
      frame = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
      resize.disconnect();
      watch.disconnect();
      geometry.dispose();
      core.dispose();
      glow.dispose();
      glass.dispose();
      room.dispose();
      environment.dispose();
      renderer.dispose();
    };
  }, [reduced]);

  return <canvas ref={canvas} aria-hidden="true" className="h-24 w-full md:h-32" />;
}
