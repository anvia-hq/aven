import type { CSSProperties } from "react";

import { isLightTint } from "./avatar";

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
