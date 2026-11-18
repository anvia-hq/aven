import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
  BackSide,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
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
    const width = geometry.boundingBox
      ? geometry.boundingBox.max.x - geometry.boundingBox.min.x
      : 6;

    const body = new MeshPhysicalMaterial({
      color: 0x9fe9de,
      transparent: true,
      opacity: 0.2,
      roughness: 0.04,
      metalness: 0,
      ior: 1.52,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      specularIntensity: 1,
      envMapIntensity: 1.6,
      depthWrite: false,
    });
    const rim = new MeshPhysicalMaterial({
      color: 0x2bb5a6,
      transparent: true,
      opacity: 0.12,
      roughness: 0.2,
      side: BackSide,
      depthWrite: false,
    });

    const group = new Group();
    group.add(new Mesh(geometry, rim), new Mesh(geometry, body));
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
      const byWidth = (width * 1.5) / aspect / (2 * Math.tan((FOV * Math.PI) / 360));
      const byHeight = 3.4 / (2 * Math.tan((FOV * Math.PI) / 360));
      camera.position.set(0, 0, Math.max(byWidth, byHeight));
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
      body.dispose();
      rim.dispose();
      room.dispose();
      environment.dispose();
      renderer.dispose();
    };
  }, [reduced]);

  return <canvas ref={canvas} aria-hidden="true" className="h-28 w-full md:h-36" />;
}
