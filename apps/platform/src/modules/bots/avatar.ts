import { isLightTint } from "@/lib/bubble-tint";
import { SHAPES } from "./avatar-shapes";
import type { Avatar, AvatarSetting } from "./types";

export { isLightTint };

export const families: readonly string[] = SHAPES.map((shape) => shape.name);

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

export function paletteColor(name: string) {
  return colors[hash(name) % colors.length]!;
}

function random(seed: string) {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function avatarFor(id: string, setting?: AvatarSetting): Avatar {
  const next = random(setting?.seed ?? id);
  const pick = <T>(values: readonly T[]) => values[Math.floor(next() * values.length)]!;
  const randomFamily = pick(families);
  const randomColor = pick(colors);
  const delay = Math.floor(next() * 4000);
  const family = families.find((candidate) => candidate === setting?.family) ?? randomFamily;
  return { family, color: setting?.color ?? randomColor, delay };
}

export const randomSeed = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const FAMILY = /^[a-z]{3,12}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

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

export const formatAvatarSetting = (setting: AvatarSetting) => JSON.stringify(setting);
