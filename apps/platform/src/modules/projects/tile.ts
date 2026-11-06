// The colors of a project's mark, picked by the project's id, so a project is always the same, and
// among a person's projects no palette is used again before all six are in use (`tilePalettes`). Like a bot's colors (decision 0062) these are palette data kept with the
// project, not theme colors.

/** A base color and three accents, of which the mark uses the first three. */
type Palette = readonly [base: string, a: string, b: string, c: string];

const palettes: readonly Palette[] = [
  ["#ff6a3d", "#ffb347", "#ff3d7f", "#ff8a5c"], // sunset
  ["#12a37f", "#2dd4bf", "#5be37d", "#0e7490"], // emerald
  ["#1e6bff", "#22d3ee", "#6366f1", "#38bdf8"], // ocean
  ["#f59e0b", "#fde047", "#f97316", "#84cc16"], // citrus
  ["#0ea5b7", "#34d399", "#3b82f6", "#a7f3d0"], // lagoon
  ["#34d399", "#a3e635", "#22d3ee", "#3b82f6"], // mint
];

function hash(text: string) {
  let value = 5381;
  for (const character of text) value = (value * 33 + character.codePointAt(0)!) >>> 0;
  return value;
}

/**
 * The palette of each project, given them oldest first. A project starts from the palette its id
 * hashes to and takes the next one nobody has used, so the first six projects all differ instead
 * of two meeting by chance (one in six for any two). Adding a project changes no other; removing
 * one can move the ones made after it.
 */
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

/** The seed a project's id gives its mark's shape. */
export function tileSeed(projectId: string) {
  return hash(projectId);
}

/**
 * The three colors a project's mark takes while it works; the same project always gets the same.
 * `palette` is the one `tilePalettes` gave it, else the one its id hashes to.
 */
export function tileColors(projectId: string, palette?: number): readonly [string, string, string] {
  const [base, a, b] = palettes[palette ?? hash(projectId) % palettes.length]!;
  return [base, a, b];
}
