import { toneSet, blend, paintDust, rgba, LIGHT_START } from "../projects/orb-art";
import type { OrbColors, Rgb } from "../projects/types";
import { apply, TAU, viewAt } from "../marks/rotation";
import type { Vec3 } from "../marks/types";

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

const EYE = 4.5;
const SCALE = 0.235;
const HALF = 0.88;

const clamp = (amount: number) => Math.min(Math.max(amount, 0), 1);

type Paint = {
  ink: Rgb;
  colors: OrbColors;
  color: number;
  turn: number;
};

export function paintBox(
  context: CanvasRenderingContext2D,
  size: number,
  { ink, colors, color, turn }: Paint,
) {
  const [a, b, c, white] = toneSet(ink, colors, color);
  const centre = size / 2;
  const scale = size * SCALE;
  const stroke = Math.max(size * 0.045, 1);
  const light = LIGHT_START + TAU * turn;
  const lit: Vec3 = [Math.cos(light) * 0.7, -Math.sin(light) * 0.7, 0.55];
  const rotation = viewAt(turn);
  const project = ([x, y, depth]: Vec3) => {
    const focus = EYE / (EYE - depth);
    return { x: centre + x * focus * scale, y: centre - y * focus * scale, depth, focus };
  };
  const points = UNIT.map(([x, y, z]) => project(apply(rotation, [x * HALF, y * HALF, z * HALF])));
  const faces = FACES.map(({ corners: outline, normal }) => {
    const [x, y, z] = apply(rotation, normal);
    const [fx, fy, fz] = apply(rotation, [normal[0] * HALF, normal[1] * HALF, normal[2] * HALF]);
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

  EDGES.forEach(([from, to], index) => {
    const start = points[from]!;
    const end = points[to]!;
    const front = faces.some(
      ({ corners: outline, toward }) => toward && outline.includes(from) && outline.includes(to),
    );
    const near = clamp(0.5 + ((start.depth + end.depth) / 2) * 0.35);
    context.lineWidth = stroke * ((start.focus + end.focus) / 2) ** 1.5;
    const sweep = 0.5 + 0.5 * Math.sin(light + index * 1.3);
    const edge = blend(blend(a, c, sweep), white, near * 0.55);
    context.strokeStyle = rgba(edge, front ? 0.95 : 0.28);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  });

  if (color > 0.01) paintDust(context, size, size * 0.31, [a, b, c, white], color, turn);
}
