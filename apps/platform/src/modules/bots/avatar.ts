// A bot's avatar (decision 0062), taken from the Anvia harness: a small character made from a
// shape, a color and a face, which a seed picks when the person has not. The seed is the bot's id
// until they choose another, so a bot always looks the same and every bot looks its own.

/** What the person chose; whatever is left out comes from the seed. */
export type AvatarSetting = { seed?: string; family?: string; color?: string };

export type Part =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number; r: number }
  | { kind: "path"; d: string }
  | { kind: "polygon"; points: string };

export type Point = { x: number; y: number };

type Family = {
  name: string;
  parts: readonly Part[];
  /** Where the face goes. */
  face: Point;
  /** How far from the middle the shape reaches, which the ring of a bot at work goes around. */
  reach: number;
};

const circle = (cx: number, cy: number, r: number): Part => ({ kind: "circle", cx, cy, r });
const rect = (x: number, y: number, width: number, height: number, r: number): Part => ({
  kind: "rect",
  x,
  y,
  width,
  height,
  r,
});
const polygon = (points: string): Part => ({ kind: "polygon", points });

// Each shape is drawn in a 48 by 48 box.
export const families: readonly Family[] = [
  { name: "circle", parts: [circle(24, 24, 17)], face: { x: 24, y: 24 }, reach: 17 },
  {
    name: "flower",
    parts: [
      circle(15.5, 15.5, 9.5),
      circle(32.5, 15.5, 9.5),
      circle(15.5, 32.5, 9.5),
      circle(32.5, 32.5, 9.5),
      circle(24, 24, 12),
    ],
    face: { x: 24, y: 24.5 },
    reach: 21.5,
  },
  {
    name: "bean",
    parts: [rect(7, 7, 34, 18.5, 8), rect(7, 22.5, 34, 18.5, 8)],
    face: { x: 24, y: 24 },
    reach: 21,
  },
  {
    name: "stack",
    parts: [rect(7, 6, 34, 13, 6.5), rect(7, 17.5, 34, 13, 6.5), rect(7, 29, 34, 13, 6.5)],
    face: { x: 24, y: 24 },
    reach: 21.5,
  },
  {
    name: "crown",
    parts: [rect(7, 13, 34, 28, 9), circle(13, 13, 6), circle(24, 12, 6), circle(35, 13, 6)],
    face: { x: 24, y: 27 },
    reach: 21.5,
  },
  {
    name: "arch",
    parts: [{ kind: "path", d: "M7 24a17 17 0 0 1 34 0v12a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5Z" }],
    face: { x: 24, y: 26 },
    reach: 21,
  },
  {
    name: "hexagon",
    parts: [polygon("8,24 16,10 32,10 40,24 32,38 16,38")],
    face: { x: 24, y: 24 },
    reach: 19,
  },
  { name: "triangle", parts: [polygon("24,9 40,37 8,37")], face: { x: 24, y: 29 }, reach: 20 },
  { name: "square", parts: [rect(8, 8, 32, 32, 7)], face: { x: 24, y: 24 }, reach: 20 },
  {
    name: "quarter",
    parts: [{ kind: "path", d: "M41 41H12a5 5 0 0 1-5-5A29 29 0 0 1 36 7a5 5 0 0 1 5 5Z" }],
    face: { x: 27, y: 29 },
    reach: 22,
  },
  { name: "capsule", parts: [rect(5, 13, 38, 22, 11)], face: { x: 24, y: 24 }, reach: 19 },
  { name: "diamond", parts: [polygon("24,8 40,24 24,40 8,24")], face: { x: 24, y: 24 }, reach: 19 },
];

// What a bot can be colored: palette data kept with the bot, not theme colors.
export const colors: readonly string[] = [
  "#ff6eb4",
  "#ff2d92",
  "#9d4dff",
  "#c06bff",
  "#00b2ff",
  "#0a5cff",
  "#00a84f",
  "#00d46a",
  "#ff3b0a",
  "#ff6a00",
  "#ff9500",
  "#ffc400",
];

export const faces = ["smile", "grin", "curious", "glance"] as const;
type Face = (typeof faces)[number];

export type Avatar = {
  family: string;
  color: string;
  face: Face;
  parts: readonly Part[];
  center: Point;
  reach: number;
  /** How long into its bob it starts, so a list of bots does not move as one. */
  delay: number;
};

function hash(seed: string) {
  let value = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d);
  value ^= value >>> 12;
  return value >>> 0;
}

/** A color of the palette for a name, the same every time: a cockpit tag's (decision 0106). */
export function paletteColor(name: string) {
  return colors[hash(name) % colors.length]!;
}

// A stream of numbers from 0 to 1 that is the same every time for the same seed.
function random(seed: string) {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** The character for a bot: what was chosen, and the rest from the setting's seed or else the bot's id. */
export function avatarFor(id: string, setting?: AvatarSetting): Avatar {
  const next = random(setting?.seed ?? id);
  const pick = <T>(values: readonly T[]) => values[Math.floor(next() * values.length)]!;
  const randomFamily = pick(families);
  const randomColor = pick(colors);
  const face = pick(faces);
  const delay = Math.floor(next() * 4000);
  const family = families.find((candidate) => candidate.name === setting?.family) ?? randomFamily;
  return {
    family: family.name,
    color: setting?.color ?? randomColor,
    face,
    parts: family.parts,
    center: family.face,
    reach: family.reach,
    delay,
  };
}

/** A seed for a character the person has not seen before. Not `randomUUID`, which a page on plain http, such as a LAN address, does not have. */
export const randomSeed = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const FAMILY = /^[a-z]{3,12}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

/** The setting a bot's avatar holds, or null when it is empty or something else, such as a text. */
export function parseAvatarSetting(avatar: string): AvatarSetting | null {
  try {
    const value: unknown = JSON.parse(avatar);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const { seed, family, color, ...rest } = value as Record<string, unknown>;
    if (Object.keys(rest).length > 0) return null;
    const setting: AvatarSetting = {};
    if (seed !== undefined) {
      if (typeof seed !== "string" || seed.length < 1 || seed.length > 64) return null;
      setting.seed = seed;
    }
    if (family !== undefined) {
      if (typeof family !== "string" || !FAMILY.test(family)) return null;
      setting.family = family;
    }
    if (color !== undefined) {
      if (typeof color !== "string" || !COLOR.test(color)) return null;
      setting.color = color;
    }
    return setting;
  } catch {
    return null;
  }
}

/** A setting as the bot keeps it. */
export const formatAvatarSetting = (setting: AvatarSetting) => JSON.stringify(setting);
