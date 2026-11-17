import type { OrbColors, Rgb } from "../projects/types";
import { blend, hexRgb, orbShape, paintDust, random, rgba } from "../projects/orb-art";
import type { BoxAxis, BoxShape, Mat3, Vec3 } from "./types";

export const IDENTITY: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const FACES: readonly { corners: readonly number[]; normal: Vec3 }[] = [
  { corners: [0, 1, 2, 3], normal: [0, 0, -1] },
  { corners: [4, 5, 6, 7], normal: [0, 0, 1] },
  { corners: [0, 1, 5, 4], normal: [0, -1, 0] },
  { corners: [3, 2, 6, 7], normal: [0, 1, 0] },
  { corners: [0, 3, 7, 4], normal: [-1, 0, 0] },
  { corners: [1, 2, 6, 5], normal: [1, 0, 0] },
];

const EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

const UNIT: readonly Vec3[] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];

const LIGHT_TURN = 0.6;
const EYE = 4.5;
const SCALE = 0.23;

export function multiply(left: Mat3, right: Mat3): Mat3 {
  const cell = (row: number, column: number) =>
    left[row]![0]! * right[0]![column]! +
    left[row]![1]! * right[1]![column]! +
    left[row]![2]! * right[2]![column]!;
  return [
    [cell(0, 0), cell(0, 1), cell(0, 2)],
    [cell(1, 0), cell(1, 1), cell(1, 2)],
    [cell(2, 0), cell(2, 1), cell(2, 2)],
  ];
}

export function turnAbout(axis: "x" | "y" | "z", angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  if (axis === "x")
    return [
      [1, 0, 0],
      [0, c, -s],
      [0, s, c],
    ];

  if (axis === "y")
    return [
      [c, 0, s],
      [0, 1, 0],
      [-s, 0, c],
    ];

  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

export function boxShape(seed: number): BoxShape {
  const next = random(seed ^ 0x9e3779b9);
  const turn = () => next() * Math.PI * 2;
  const sign = () => (next() < 0.5 ? -1 : 1);
  const start = multiply(
    multiply(turnAbout("y", turn()), turnAbout("x", 0.5 + next() * 0.4)),
    turnAbout("z", turn()),
  );
  const half: Vec3 = [0.78 + next() * 0.22, 0.78 + next() * 0.22, 0.78 + next() * 0.22];
  const frames = Array.from({ length: 2 + Math.floor(next() * 2) }, () => ({
    across: 0.3 + next() * 0.6,
    tilt: multiply(turnAbout("x", next() * Math.PI), turnAbout("y", next() * Math.PI)),
    speed: sign() * (0.4 + next() * 0.7),
  }));
  return {
    orb: orbShape(seed),
    start,
    phase: [turn(), turn(), turn()],
    rates: [
      sign() * (0.5 + next() * 0.7),
      sign() * (0.7 + next() * 0.7),
      sign() * (0.4 + next() * 0.6),
    ],
    half,
    frames,
  };
}

export function boxRotation(shape: BoxShape, time: number, axis: BoxAxis): Mat3 {
  if (axis === "tumble") {
    const [x, y, z] = shape.phase;
    const [rx, ry, rz] = shape.rates;
    return multiply(
      multiply(
        multiply(turnAbout("y", y + time * ry), turnAbout("x", x + time * rx)),
        turnAbout("z", z + time * rz),
      ),
      shape.start,
    );
  }

  return multiply(turnAbout(axis, time * 1.3), shape.start);
}

function apply(matrix: Mat3, [x, y, z]: Vec3): Vec3 {
  return [
    matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z,
    matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z,
    matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z,
  ];
}

const clamp = (amount: number) => Math.min(Math.max(amount, 0), 1);

type Paint = {
  ink: Rgb;
  colors: OrbColors;
  color: number;
  time: number;
  rotation: Mat3;
};

export function paintBox(
  context: CanvasRenderingContext2D,
  size: number,
  shape: BoxShape,
  { ink, colors, color, time, rotation }: Paint,
) {
  const a = blend(ink, hexRgb(colors[0]), color);
  const b = blend(ink, hexRgb(colors[1]), color);
  const c = blend(ink, hexRgb(colors[2]), color);
  const white: Rgb = blend(ink, [255, 255, 255], color);
  const centre = size / 2;
  const scale = size * SCALE;
  const stroke = Math.max(size * 0.045, 1);
  const light = shape.orb.light + time * LIGHT_TURN;
  const lit: Vec3 = [Math.cos(light) * 0.7, -Math.sin(light) * 0.7, 0.55];
  const corners = UNIT.map(([x, y, z]): Vec3 => [
    x * shape.half[0],
    y * shape.half[1],
    z * shape.half[2],
  ]);
  const project = ([x, y, depth]: Vec3) => {
    const focus = EYE / (EYE - depth);
    return { x: centre + x * focus * scale, y: centre - y * focus * scale, depth, focus };
  };
  const points = corners.map((corner) => project(apply(rotation, corner)));
  const faces = FACES.map(({ corners: outline, normal }) => {
    const [x, y, z] = apply(rotation, normal);
    const [fx, fy, fz] = apply(rotation, [
      normal[0] * shape.half[0],
      normal[1] * shape.half[1],
      normal[2] * shape.half[2],
    ]);
    return {
      corners: outline,
      toward: x * -fx + y * -fy + z * (EYE - fz) > 0,
      shade: clamp(0.5 + 0.5 * (x * lit[0] + y * lit[1] + z * lit[2])),
    };
  });
  context.clearRect(0, 0, size, size);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.lineWidth = stroke;

  for (const { corners: outline, toward, shade } of faces) {
    if (!toward) continue;

    context.fillStyle = rgba(blend(b, white, shade * 0.55), 0.06 + 0.24 * shade);
    context.beginPath();
    outline.forEach((corner, step) => {
      const point = points[corner]!;

      if (step === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.fill();
  }

  context.lineWidth = stroke * 0.8;
  shape.frames.forEach((frame, index) => {
    const spin = turnAbout("z", time * frame.speed);
    const placed = multiply(rotation, multiply(frame.tilt, spin));
    const reach = 0.92;
    const ring: Vec3[] = [
      [-reach, -reach * frame.across, 0],
      [reach, -reach * frame.across, 0],
      [reach, reach * frame.across, 0],
      [-reach, reach * frame.across, 0],
    ];
    context.strokeStyle = rgba(index % 2 ? b : c, 0.7 * (0.35 + 0.65 * color));
    context.beginPath();
    ring.forEach((corner, step) => {
      const { x: px, y: py } = project(apply(placed, corner));

      if (step === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.closePath();
    context.stroke();
  });
  context.lineWidth = stroke;

  EDGES.forEach(([from, to], index) => {
    const start = points[from]!;
    const end = points[to]!;
    const front = faces.some(
      ({ corners: outline, toward }) => toward && outline.includes(from) && outline.includes(to),
    );
    const near = clamp(0.5 + ((start.depth + end.depth) / 2) * 0.35);
    context.lineWidth = stroke * ((start.focus + end.focus) / 2) ** 1.5;
    const sweep = 0.5 + 0.5 * Math.sin(light * 1.6 + index * 1.3);
    const edge = blend(blend(a, c, sweep), white, near * 0.55);
    context.strokeStyle = rgba(edge, front ? 0.95 : 0.28);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  });

  if (color > 0.01) paintDust(context, size, size * 0.31, shape.orb, [a, b, c, white], color, time);
}
