import type { FamilyShape, ShapeField, Vec3 } from "./types";

export const DEPTH = 0.86;

const FAR = 5;
const STEPS = 26;

const length = (x: number, y: number) => Math.sqrt(x * x + y * y);

function smoothMin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

const smoothMax = (a: number, b: number, k: number) => -smoothMin(-a, -b, k);

function segment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return length(pax - bax * h, pay - bay * h);
}

function box(px: number, py: number, hx: number, hy: number) {
  const dx = Math.abs(px) - hx;
  const dy = Math.abs(py) - hy;
  return length(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

function hexagon(px: number, py: number, radius: number) {
  const kx = -0.866025404;
  const ky = 0.5;
  const kz = 0.577350269;
  const x = Math.abs(px);
  const y = Math.abs(py);
  const fold = 2 * Math.min(kx * x + ky * y, 0);
  const fx = x - fold * kx;
  const fy = y - fold * ky;
  const cx = fx - Math.min(Math.max(fx, -kz * radius), kz * radius);
  const cy = fy - radius;
  return length(cx, cy) * Math.sign(cy);
}

function triangle(px: number, py: number, radius: number) {
  const k = Math.sqrt(3);
  const x = Math.abs(px) - radius;
  const y = py + radius / k;
  const folded = x + k * y > 0;
  const fx = folded ? (x - k * y) / 2 : x;
  const fy = folded ? (-k * x - y) / 2 : y;
  const cx = fx - Math.min(Math.max(fx, -2 * radius), 0);
  return -length(cx, fy) * Math.sign(fy);
}

function rhombus(px: number, py: number, bx: number, by: number) {
  const x = Math.abs(px);
  const y = Math.abs(py);
  const dot = (bx - 2 * x) * bx - (by - 2 * y) * by;
  const h = Math.min(1, Math.max(-1, dot / (bx * bx + by * by)));
  const d = length(x - 0.5 * bx * (1 - h), y - 0.5 * by * (1 + h));
  return d * Math.sign(x * by + y * bx - bx * by);
}

const FLOWER_LOBES = [0.9, 0.83, 0.9, 0.9, 0.83].map((radius, index) => {
  const angle = Math.PI / 2 + (index * 2 * Math.PI) / 5;
  return { x: Math.cos(angle) * 1.2, y: Math.sin(angle) * 1.2, radius };
});

const flower: ShapeField = (x, y, z) =>
  FLOWER_LOBES.reduce(
    (nearest, lobe) =>
      smoothMin(
        nearest,
        Math.sqrt((x - lobe.x) ** 2 + (y - lobe.y) ** 2 + z * z) - lobe.radius,
        0.3,
      ),
    Math.sqrt(x * x + y * y + z * z) - 1,
  );

const puffed =
  (radius: number, plate: (x: number, y: number) => number): ShapeField =>
  (x, y, z) => {
    const away = Math.max(plate(x, y), 0);
    return Math.sqrt(away * away + z * z) - radius;
  };

export const SHAPES: readonly FamilyShape[] = [
  {
    name: "circle",
    field: puffed(1.5, (x, y) => length(x, y)),
    eye: { x: 0, y: 0.1, gap: 0.5, scale: 1 },
  },
  { name: "flower", field: flower, eye: { x: 0, y: 0.22, gap: 0.5, scale: 1 } },
  {
    name: "bean",
    field: puffed(0.95, (x, y) =>
      smoothMin(segment(x, y, -0.45, 0.5, 0.45, 0.5), segment(x, y, -0.45, -0.5, 0.45, -0.5), 0.35),
    ),
    eye: { x: 0, y: 0.05, gap: 0.55, scale: 1 },
  },
  {
    name: "stack",
    field: puffed(0.7, (x, y) =>
      smoothMin(
        smoothMin(segment(x, y, -0.8, 0.9, 0.8, 0.9), segment(x, y, -0.8, 0, 0.8, 0), 0.35),
        segment(x, y, -0.8, -0.9, 0.8, -0.9),
        0.35,
      ),
    ),
    eye: { x: 0, y: 0, gap: 0.55, scale: 0.72 },
  },
  {
    name: "crown",
    field: puffed(0.8, (x, y) => {
      const bumps = smoothMin(
        length(x + 0.75, y - 0.55),
        smoothMin(length(x, y - 0.8), length(x - 0.75, y - 0.55), 0.2),
        0.2,
      );
      return smoothMin(box(x, y + 0.35, 0.7, 0.35), bumps, 0.3);
    }),
    eye: { x: 0, y: -0.25, gap: 0.5, scale: 0.95 },
  },
  {
    name: "arch",
    field: puffed(0.9, (x, y) => Math.min(box(x, y + 0.5, 0.4, 0.5), length(x, y) - 0.4)),
    eye: { x: 0, y: -0.15, gap: 0.5, scale: 1 },
  },
  {
    name: "hexagon",
    field: puffed(0.9, (x, y) => hexagon(x, y, 0.5)),
    eye: { x: 0, y: 0, gap: 0.52, scale: 1 },
  },
  {
    name: "triangle",
    field: puffed(0.8, (x, y) => triangle(x, y, 0.62)),
    eye: { x: 0, y: -0.2, gap: 0.42, scale: 0.85 },
  },
  {
    name: "square",
    field: puffed(0.95, (x, y) => box(x, y, 0.5, 0.5)),
    eye: { x: 0, y: 0, gap: 0.55, scale: 1 },
  },
  {
    name: "quarter",
    field: puffed(1.15, (x, y) =>
      smoothMax(length(x - 0.34, y + 0.34) - 0.8, smoothMax(x - 0.34, -0.34 - y, 0.5), 0.5),
    ),
    eye: { x: -0.12, y: 0.12, gap: 0.5, scale: 1 },
  },
  {
    name: "capsule",
    field: puffed(0.95, (x, y) => segment(x, y, -0.7, 0, 0.7, 0)),
    eye: { x: 0, y: 0, gap: 0.6, scale: 0.92 },
  },
  {
    name: "diamond",
    field: puffed(0.8, (x, y) => rhombus(x, y, 0.8, 0.8)),
    eye: { x: 0, y: -0.02, gap: 0.42, scale: 0.85 },
  },
];

export function shapeOf(name: string) {
  return SHAPES.find((shape) => shape.name === name) ?? SHAPES[0]!;
}

export function reach(field: ShapeField, dx: number, dy: number, dz: number) {
  let near = 0;
  let far = FAR;

  for (let step = 0; step < STEPS; step++) {
    const middle = (near + far) / 2;

    if (field(dx * middle, dy * middle, dz * middle) < 0) near = middle;
    else far = middle;
  }

  return near;
}

export function frontDepth(field: ShapeField, x: number, y: number) {
  let near = 0;
  let far = FAR;

  for (let step = 0; step < STEPS; step++) {
    const middle = (near + far) / 2;

    if (field(x, y, middle) < 0) near = middle;
    else far = middle;
  }

  return near;
}

export function outward(field: ShapeField, x: number, y: number, z: number): Vec3 {
  const e = 0.003;
  const nx = field(x + e, y, z) - field(x - e, y, z);
  const ny = field(x, y + e, z) - field(x, y - e, z);
  const nz = (field(x, y, z + e) - field(x, y, z - e)) / DEPTH;
  const size = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  return { x: nx / size, y: ny / size, z: nz / size };
}
