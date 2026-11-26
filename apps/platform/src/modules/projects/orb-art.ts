import { apply, multiply, TAU, turnAbout, viewAt } from "../marks/rotation";
import type { Vec3 } from "../marks/types";
import type { Dot, OrbColors, Rgb } from "./types";

export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822507) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export const DOTS = 44;
export const LIGHT_START = -0.9;

const next = random(20260126);
const DUST: readonly Dot[] = Array.from({ length: DOTS }, (_, index) => ({
  lobe: [0, 1.25, -1.25][index % 3]!,
  spread: (next() - 0.5) * 0.8,
  start: 0.55 + next() * 0.45,
  reach: 0.12 + next() * 0.3,
  curl: (next() - 0.35) * 0.9,
  cycles: next() < 0.5 ? 1 : 2,
  phase: next(),
  wobble: 1 + Math.floor(next() * 3),
  wobblePhase: next() * TAU,
  twinkle: 2 + Math.floor(next() * 4),
  size: 0.018 + next() * next() * 0.05,
  alpha: 0.8 + next() * 0.2,
  tone: Math.floor(next() * 4),
}));

export function hexRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
}

export function rgbHex([red, green, blue]: Rgb) {
  return `#${[red, green, blue]
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function markColors(hex: string): OrbColors {
  const base = hexRgb(hex);
  return [hex, rgbHex(blend(base, [255, 255, 255], 0.45)), rgbHex(blend(base, [0, 0, 0], 0.3))];
}

export function rgba([r, g, b]: Rgb, alpha: number) {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${alpha})`;
}

export function blend(from: Rgb, to: Rgb, amount: number): Rgb {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

export function toneSet(ink: Rgb, colors: OrbColors, color: number): [Rgb, Rgb, Rgb, Rgb] {
  return [
    blend(ink, hexRgb(colors[0]), color),
    blend(ink, hexRgb(colors[1]), color),
    blend(ink, hexRgb(colors[2]), color),
    blend(ink, [255, 255, 255], color),
  ];
}

type Paint = {
  ink: Rgb;
  colors: OrbColors;
  color: number;
  turn: number;
};

const SEGMENTS = 72;
const EYE = 7;
const CIRCLES: readonly ((angle: number) => Vec3)[] = [
  (angle) => [Math.cos(angle), 0, Math.sin(angle)],
  (angle) => [Math.cos(angle), Math.sin(angle), 0],
  (angle) => [0, Math.cos(angle), Math.sin(angle)],
];

type Segment = { fromX: number; fromY: number; toX: number; toY: number; depth: number };

export function paintOrb(
  context: CanvasRenderingContext2D,
  size: number,
  { ink, colors, color, turn }: Paint,
) {
  const [a, b, c, white] = toneSet(ink, colors, color);
  const centre = size / 2;
  const radius = size * 0.35;
  const stroke = Math.max(size * 0.04, 1);
  const light = LIGHT_START + TAU * (turn % 1);
  context.clearRect(0, 0, size, size);

  const glass = context.createRadialGradient(
    centre + Math.cos(light) * radius * 0.4,
    centre + Math.sin(light) * radius * 0.4,
    0,
    centre,
    centre,
    radius,
  );
  glass.addColorStop(0, rgba(b, 0.22));
  glass.addColorStop(1, rgba(a, 0.03));
  context.fillStyle = glass;
  context.beginPath();
  context.arc(centre, centre, radius, 0, TAU);
  context.fill();

  const view = viewAt(turn);
  const tumbles = [turnAbout("y", 0), turnAbout("x", TAU * turn), turnAbout("z", -2 * TAU * turn)];
  const segments = CIRCLES.flatMap((circle, index) => {
    const placed = multiply(view, tumbles[index]!);
    const points = Array.from({ length: SEGMENTS + 1 }, (_, step) => {
      const [x, y, depth] = apply(placed, circle((TAU * step) / SEGMENTS));
      const focus = EYE / (EYE - depth);
      return { x: centre + x * radius * 0.9 * focus, y: centre - y * radius * 0.9 * focus, depth };
    });
    return points.slice(1).map((point, step): Segment => ({
      fromX: points[step]!.x,
      fromY: points[step]!.y,
      toX: point.x,
      toY: point.y,
      depth: Math.round(((points[step]!.depth + point.depth) / 2) * 1e6) / 1e6,
    }));
  });
  segments.sort((left, right) => left.depth - right.depth);
  context.lineCap = "round";

  for (const { fromX, fromY, toX, toY, depth } of segments) {
    const near = (depth + 1) / 2;
    context.lineWidth = stroke * (0.45 + 0.9 * near);
    context.strokeStyle = rgba(blend(b, white, near * 0.55), 0.16 + 0.78 * near);
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();
  }

  context.lineWidth = stroke * 0.7;
  const sweep = context.createConicGradient(light, centre, centre);
  sweep.addColorStop(0, rgba(white, 0.95));
  sweep.addColorStop(0.18, rgba(b, 1));
  sweep.addColorStop(0.5, rgba(a, 0.9));
  sweep.addColorStop(0.78, rgba(c, 1));
  sweep.addColorStop(1, rgba(white, 0.95));
  context.strokeStyle = sweep;
  context.beginPath();
  context.arc(centre, centre, radius, 0, TAU);
  context.stroke();

  if (color > 0.01) paintDust(context, size, radius, [a, b, c, white], color, turn);
}

const easeOut = (amount: number) => 1 - (1 - amount) ** 2.4;
const smooth = (amount: number) => {
  const x = Math.min(Math.max(amount, 0), 1);
  return x * x * (3 - 2 * x);
};

export function paintDust(
  context: CanvasRenderingContext2D,
  size: number,
  radius: number,
  tones: Rgb[],
  color: number,
  turn: number,
) {
  const centre = size / 2;

  for (const dot of DUST) {
    const life = (dot.phase + turn * dot.cycles) % 1;
    const born = LIGHT_START + TAU * (turn - life / dot.cycles);
    const angle =
      born +
      dot.lobe +
      dot.spread +
      life * dot.curl +
      Math.sin(TAU * dot.wobble * life + dot.wobblePhase) * 0.1 * life;
    const distance = radius * (dot.start + (1 + dot.reach - dot.start) * easeOut(life));
    const twinkle = 0.75 + 0.25 * Math.sin(TAU * dot.twinkle * life + dot.wobblePhase);
    const alpha = dot.alpha * color * twinkle * smooth(life / 0.12) * (1 - life) ** 1.3;
    const x = centre + Math.cos(angle) * distance;
    const y = centre + Math.sin(angle) * distance;
    const grain = Math.max(size * dot.size * (1.1 - 0.65 * life), 0.8);
    const tone = tones[dot.tone]!;
    context.fillStyle = rgba(tone, alpha * 0.2);
    context.beginPath();
    context.arc(x, y, grain * 2, 0, TAU);
    context.fill();
    context.fillStyle = rgba(tone, alpha);
    context.beginPath();
    context.arc(x, y, grain, 0, TAU);
    context.fill();
  }
}
