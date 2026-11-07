// A project's mark: a glass ring drawn on a canvas, different for every project. Its id picks the
// ring's tilt, the rings inside it, where the light falls and how the dust is shed, so a project
// always looks the same and no two look alike. At rest it is one ink color and bare; while the
// project's thread works it takes the project's palette, the inner rings turn and the light sweeps
// round the edge, shedding dust. Colors are palette data like a bot's (decision 0062).

/** Three colors the ring's edge runs through while the project works. */
export type OrbColors = readonly [string, string, string];
export type Rgb = readonly [number, number, number];

type Ring = { across: number; turn: number; speed: number };
// A speck of the dust the light sheds. Each lives for `1 / rate` seconds, and is born at the edge
// of the ring where the light is at that moment, offset by `lobe` and `spread`, so the dust trails
// the light as it sweeps round. It starts `start` of the way out from the centre, drifts to `reach`
// past the ring (slowing as it goes), curls by `curl` and wobbles sideways as it travels.
type Dot = {
  lobe: number;
  spread: number;
  start: number;
  reach: number;
  curl: number;
  rate: number;
  phase: number;
  wobble: number;
  wobblePhase: number;
  twinkle: number;
  size: number;
  alpha: number;
  tone: number;
};
export type OrbShape = { light: number; rings: Ring[]; dots: Dot[] };

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822507) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export const DOTS = 72;

// How fast the light sweeps round the ring, in radians a second.
const LIGHT_TURN = 0.6;

/** What a project's id decides, once; painting it is then only arithmetic. */
export function orbShape(seed: number): OrbShape {
  const next = random(seed);
  const light = next() * Math.PI * 2;
  const rings = Array.from({ length: 2 + Math.floor(next() * 2) }, () => ({
    across: 0.25 + next() * 0.7,
    turn: next() * Math.PI,
    speed: (next() < 0.5 ? -1 : 1) * (0.25 + next() * 0.35),
  }));
  // Three lobes of dust round the light, the way a spray leaves a turning wheel.
  const lobes = [0, 1.1 + next() * 0.4, -(1.1 + next() * 0.4)];
  const dots = Array.from({ length: DOTS }, (_, index) => ({
    lobe: lobes[index % 3]!,
    spread: (next() - 0.5) * 0.8,
    start: 0.55 + next() * 0.45,
    reach: 0.12 + next() * 0.3,
    curl: (next() - 0.35) * 0.9,
    rate: 0.3 + next() * 0.5,
    phase: next(),
    wobble: 2 + next() * 4,
    wobblePhase: next() * Math.PI * 2,
    twinkle: 3 + next() * 5,
    size: 0.018 + next() * next() * 0.05,
    alpha: 0.8 + next() * 0.2,
    tone: Math.floor(next() * 4),
  }));
  return { light, rings, dots };
}

function hexRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
}

function rgba([r, g, b]: Rgb, alpha: number) {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${alpha})`;
}

function blend(from: Rgb, to: Rgb, amount: number): Rgb {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

type Paint = {
  /** The resting color, as the page's muted text. */
  ink: Rgb;
  colors: OrbColors;
  /** 0 at rest, 1 working in the palette. */
  color: number;
  /** Seconds, which turns the rings; 0 holds them still. */
  time: number;
};

/** Draws the mark filling a square canvas of `size` device pixels. */
export function paintOrb(
  context: CanvasRenderingContext2D,
  size: number,
  shape: OrbShape,
  { ink, colors, color, time }: Paint,
) {
  const a = blend(ink, hexRgb(colors[0]), color);
  const b = blend(ink, hexRgb(colors[1]), color);
  const c = blend(ink, hexRgb(colors[2]), color);
  const white: Rgb = blend(ink, [255, 255, 255], color);
  const centre = size / 2;
  // Room is left round the ring for the dust that drifts out of it.
  const radius = size * 0.35;
  // One stroke width for the ring and every ring inside it.
  const stroke = Math.max(size * 0.04, 1);
  const light = shape.light + time * LIGHT_TURN;
  context.clearRect(0, 0, size, size);

  // A faint tint inside, so the ring reads as glass and not as a line.
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
  context.arc(centre, centre, radius, 0, Math.PI * 2);
  context.fill();

  context.lineWidth = stroke;
  shape.rings.forEach((ring, index) => {
    context.strokeStyle = rgba(index % 2 ? b : c, 0.7);
    context.beginPath();
    context.ellipse(
      centre,
      centre,
      radius * 0.96,
      radius * ring.across,
      ring.turn + time * ring.speed,
      0,
      Math.PI * 2,
    );
    context.stroke();
  });

  // The edge: a conic gradient that goes through white where the light falls.
  const sweep = context.createConicGradient(light, centre, centre);
  sweep.addColorStop(0, rgba(white, 0.95));
  sweep.addColorStop(0.18, rgba(b, 1));
  sweep.addColorStop(0.5, rgba(a, 0.9));
  sweep.addColorStop(0.78, rgba(c, 1));
  sweep.addColorStop(1, rgba(white, 0.95));
  context.strokeStyle = sweep;
  context.beginPath();
  context.arc(centre, centre, radius, 0, Math.PI * 2);
  context.stroke();

  // Dust, only while the mark is colored: it fades in and out with the colors, so a mark at rest
  // is bare.
  if (color > 0.01) paintDust(context, size, radius, shape, [a, b, c, white], color, time);
}

const easeOut = (amount: number) => 1 - (1 - amount) ** 2.4;
const smooth = (amount: number) => amount * amount * (3 - 2 * amount);

// Each speck is born where the light is when its life begins, and so trails it round the ring. It
// leaves quickly, slows as it goes, wobbles sideways and curls, brightens at once, twinkles, and
// dims and shrinks as it drifts away. Its life is a loop in `time`, so there is no seam.
function paintDust(
  context: CanvasRenderingContext2D,
  size: number,
  radius: number,
  shape: OrbShape,
  tones: Rgb[],
  color: number,
  time: number,
) {
  const centre = size / 2;
  for (const dot of shape.dots) {
    const life = (dot.phase + time * dot.rate) % 1;
    const age = life / dot.rate;
    const born = shape.light + (time - age) * LIGHT_TURN;
    const angle =
      born +
      dot.lobe +
      dot.spread +
      life * dot.curl +
      Math.sin(age * dot.wobble + dot.wobblePhase) * 0.1 * life;
    const distance = radius * (dot.start + (1 + dot.reach - dot.start) * easeOut(life));
    const twinkle = 0.75 + 0.25 * Math.sin(age * dot.twinkle + dot.wobblePhase);
    const alpha =
      dot.alpha * color * twinkle * smooth(Math.min(life / 0.12, 1)) * (1 - life) ** 1.3;
    const x = centre + Math.cos(angle) * distance;
    const y = centre + Math.sin(angle) * distance;
    const grain = Math.max(size * dot.size * (1.1 - 0.65 * life), 0.8);
    const tone = tones[dot.tone]!;
    // A wide faint halo and a bright core, so the dust reads as light and not as grain.
    context.fillStyle = rgba(tone, alpha * 0.2);
    context.beginPath();
    context.arc(x, y, grain * 2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = rgba(tone, alpha);
    context.beginPath();
    context.arc(x, y, grain, 0, Math.PI * 2);
    context.fill();
  }
}
