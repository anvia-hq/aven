// A project's mark: a glass ring drawn on a canvas, different for every project. Its id picks the
// ring's tilt, the rings inside it, where the light falls and where the noise gathers, so a project
// always looks the same and no two look alike. At rest it is one ink color; while the project's
// thread works it takes the project's palette and the inner rings turn. Colors are palette data
// like a bot's (decision 0062).

/** Three colors the ring's edge runs through while the project works. */
export type OrbColors = readonly [string, string, string];
export type Rgb = readonly [number, number, number];

type Ring = { across: number; turn: number; speed: number };
// A speck of the dust that streams off the ring: which stream it is in, how far through its life
// it starts, how fast it goes, and how it is drawn.
type Dot = {
  angle: number;
  swirl: number;
  phase: number;
  speed: number;
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

export const DOTS = 44;

/** What a project's id decides, once; painting it is then only arithmetic. */
export function orbShape(seed: number): OrbShape {
  const next = random(seed);
  const light = next() * Math.PI * 2;
  const rings = Array.from({ length: 2 + Math.floor(next() * 2) }, () => ({
    across: 0.25 + next() * 0.7,
    turn: next() * Math.PI,
    speed: (next() < 0.5 ? -1 : 1) * (0.25 + next() * 0.35),
  }));
  // Three streams of dust, leaving the ring on the lit side and curving as they go.
  const streams = [light, light + 0.9 + next() * 0.6, light - 0.9 - next() * 0.6];
  const dots = Array.from({ length: DOTS }, (_, index) => ({
    angle: streams[index % 3]! + (next() - 0.5) * 0.9,
    swirl: (next() - 0.3) * 1.1,
    phase: next(),
    speed: 0.07 + next() * 0.13,
    size: 0.006 + next() * next() * 0.03,
    alpha: 0.35 + next() * 0.6,
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
  const radius = size * 0.33;
  // One stroke width for the ring and every ring inside it.
  const stroke = Math.max(size * 0.04, 1);
  const light = shape.light + time * 0.6;
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

  // Noise: dust that rises from inside the ring, crosses it and drifts out, fading at both ends, so
  // a mark at rest shows a frozen cloud and a working one a slow stream.
  const tones = [a, b, c, white];
  for (const dot of shape.dots) {
    const life = (dot.phase + time * dot.speed) % 1;
    const distance = radius * (0.45 + life * 0.95);
    const angle = dot.angle + life * dot.swirl;
    context.fillStyle = rgba(tones[dot.tone]!, dot.alpha * Math.sin(life * Math.PI) ** 0.6);
    context.beginPath();
    context.arc(
      centre + Math.cos(angle) * distance,
      centre + Math.sin(angle) * distance,
      Math.max(size * dot.size * (1.15 - life * 0.5), 0.35),
      0,
      Math.PI * 2,
    );
    context.fill();
  }
}
