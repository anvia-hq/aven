import type { OrbColors } from "./types";

type Palette = OrbColors;

const palettes: readonly Palette[] = [
  ["#ff6a3d", "#ffb347", "#ff3d7f"],
  ["#12a37f", "#2dd4bf", "#5be37d"],
  ["#1e6bff", "#22d3ee", "#6366f1"],
  ["#f59e0b", "#fde047", "#f97316"],
  ["#0ea5b7", "#34d399", "#3b82f6"],
  ["#34d399", "#a3e635", "#22d3ee"],
];

function hash(text: string) {
  let value = 5381;
  for (const character of text) value = (value * 33 + character.codePointAt(0)!) >>> 0;
  return value;
}

export function tilePalettes(projectIds: readonly string[]) {
  const uses = palettes.map(() => 0);
  const chosen = new Map<string, number>();
  for (const id of projectIds) {
    const start = hash(id) % palettes.length;
    let best = start;
    for (let step = 1; step < palettes.length; step++) {
      const candidate = (start + step) % palettes.length;

      if (uses[candidate]! < uses[best]!) best = candidate;
    }
    uses[best]! += 1;
    chosen.set(id, best);
  }
  return chosen;
}

export function tileSeed(projectId: string) {
  return hash(projectId);
}

export function tileColors(projectId: string, palette?: number): OrbColors {
  return palettes[palette ?? hash(projectId) % palettes.length]!;
}
