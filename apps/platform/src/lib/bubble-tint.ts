import type { CSSProperties } from "react";

const LIGHT_TINT = 0.18;

function channel(value: number) {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

export function isLightTint(tint: string) {
  const value = Number.parseInt(tint.slice(1), 16);
  const luminance =
    0.2126 * channel((value >> 16) & 0xff) +
    0.7152 * channel((value >> 8) & 0xff) +
    0.0722 * channel(value & 0xff);
  return luminance >= LIGHT_TINT;
}

export function bubbleStyle(tint: string | undefined): CSSProperties | undefined {
  if (tint === undefined) return undefined;

  return {
    backgroundColor: tint,
    backgroundImage: `linear-gradient(to bottom, color-mix(in oklch, ${tint}, white 10%), color-mix(in oklch, ${tint}, black 6%))`,
  };
}

export function bubbleInk(tint: string | undefined) {
  if (tint === undefined) return "";

  return isLightTint(tint) ? "text-avatar-face" : "text-avatar-eye";
}
