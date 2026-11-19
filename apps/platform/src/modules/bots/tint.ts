import type { CSSProperties } from "react";

export function tintOf(color: string | undefined): CSSProperties | undefined {
  if (!color) return undefined;

  return {
    backgroundColor: `color-mix(in oklch, ${color} 24%, transparent)`,
    color: `color-mix(in oklch, ${color} 55%, var(--foreground))`,
  };
}
