import { BufferAttribute, BufferGeometry, Color, SphereGeometry } from "three";

import { DEPTH, frontDepth, outward, reach } from "./avatar-shapes";
import type { BodyBase, EyeSpot, FamilyShape, SurfaceSpot } from "./types";

const BLUSH = new Color("#ff4fa6");
const WHITE = new Color("#ffffff");
const hsl = { h: 0, s: 0, l: 0 };

const bodies = new Map<string, BodyBase>();

function smooth(from: number, to: number, x: number) {
  const u = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return u * u * (3 - 2 * u);
}

function vivid(color: Color, boost: number) {
  color.getHSL(hsl);
  return color.setHSL(hsl.h, Math.min(1, hsl.s * boost), hsl.l);
}

function eyesOf(shape: FamilyShape): EyeSpot[] {
  return [-1, 1].map((side) => {
    const x = shape.eye.x + side * shape.eye.gap;
    const y = shape.eye.y;
    const depth = frontDepth(shape.field, x, y);
    return {
      position: { x, y, z: depth * DEPTH - 0.03 },
      normal: outward(shape.field, x, y, depth),
      scale: shape.eye.scale,
    };
  });
}

function spotAt(
  shape: FamilyShape,
  x: number,
  y: number,
  scale: number,
  inset: number,
): SurfaceSpot {
  const depth = frontDepth(shape.field, x, y);
  return {
    position: { x, y, z: depth * DEPTH - inset },
    normal: outward(shape.field, x, y, depth),
    scale,
  };
}

function build(shape: FamilyShape): BodyBase {
  const sphere = new SphereGeometry(1, 56, 36);
  const position = sphere.getAttribute("position");
  const normal = sphere.getAttribute("normal");
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let index = 0; index < position.count; index++) {
    const length = Math.hypot(position.getX(index), position.getY(index), position.getZ(index));
    const dx = position.getX(index) / length;
    const dy = position.getY(index) / length;
    const dz = position.getZ(index) / length;
    const distance = reach(shape.field, dx, dy, dz);
    const x = dx * distance;
    const y = dy * distance;
    const z = dz * distance;
    const n = outward(shape.field, x, y, z);
    position.setXYZ(index, x, y, z * DEPTH);
    normal.setXYZ(index, n.x, n.y, n.z);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const topY = reach(shape.field, 0, 1, 0);
  const mouth = spotAt(shape, shape.mouth.x, shape.mouth.y, shape.mouth.scale, 0.015);
  const chinY = Math.max(minY + 0.25, shape.mouth.y - 0.36);
  const chin = spotAt(shape, shape.mouth.x, chinY, shape.mouth.scale, 0);

  return {
    geometry: sphere,
    minX,
    maxX,
    minY,
    maxY,
    eyes: eyesOf(shape),
    mouth,
    top: { x: 0, y: topY, z: 0 },
    left: { x: minX, y: shape.eye.y, z: 0 },
    right: { x: maxX, y: shape.eye.y, z: 0 },
    chin,
  };
}

export function bodyOf(shape: FamilyShape) {
  const cached = bodies.get(shape.name);

  if (cached) return cached;

  const made = build(shape);
  bodies.set(shape.name, made);
  return made;
}

export function paintedBody(base: BodyBase, hex: string) {
  const { geometry, minY, maxY } = base;
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const body = vivid(new Color(hex), 1.18);
  const top = vivid(body.clone().lerp(WHITE, 0.04), 1);
  const blush = vivid(body.clone().lerp(BLUSH, 0.82), 1.25);
  const color = new Color();
  const span = maxY - minY;

  for (let index = 0; index < position.count; index++) {
    const height = (position.getY(index) - minY) / span;
    const front = 0.5 + 0.5 * smooth(-0.2, 0.9, position.getZ(index));
    color
      .copy(top)
      .lerp(body, smooth(0.8, 0.3, height))
      .lerp(blush, smooth(0.42, 0, height) * front);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const painted = new BufferGeometry();
  const index = geometry.getIndex();

  if (index) painted.setIndex(index.clone());

  painted.setAttribute("position", position.clone());
  painted.setAttribute("normal", geometry.getAttribute("normal").clone());
  painted.setAttribute("color", new BufferAttribute(colors, 3));
  return painted;
}
