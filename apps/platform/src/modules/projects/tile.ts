// The look of a project's tile: a soft mesh of colors picked by the project's id, so a project is
// always the same, and among a person's projects no palette is used again before all six are in
// use (`tilePalettes`). Like a bot's colors (decision 0062) these are palette data kept with the
// project, not theme colors.

/** A base color and three accents that bleed into it from the corners. */
type Palette = readonly [base: string, a: string, b: string, c: string];

const palettes: readonly Palette[] = [
  ["#ff6a3d", "#ffb347", "#ff3d7f", "#ff8a5c"], // sunset
  ["#12a37f", "#2dd4bf", "#5be37d", "#0e7490"], // emerald
  ["#1e6bff", "#22d3ee", "#6366f1", "#38bdf8"], // ocean
  ["#f59e0b", "#fde047", "#f97316", "#84cc16"], // citrus
  ["#0ea5b7", "#34d399", "#3b82f6", "#a7f3d0"], // lagoon
  ["#34d399", "#a3e635", "#22d3ee", "#3b82f6"], // mint
];

// Where the three accents sit, as percentages of the tile; each project turns the mesh one of
// these ways, so one palette does not make one look.
const layouts: readonly (readonly [string, string, string])[] = [
  ["15% 10%", "92% 22%", "68% 100%"],
  ["88% 12%", "10% 60%", "55% 100%"],
  ["10% 90%", "90% 70%", "40% 0%"],
  ["95% 95%", "20% 20%", "75% 0%"],
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

/** The first letter or digit of a project's name, in capitals; `?` for a name with neither. */
export function projectInitial(name: string) {
  const match = /[\p{L}\p{N}]/u.exec(name);
  return match ? match[0].toLocaleUpperCase() : "?";
}

/**
 * The mesh, gloss and light edge of a project's tile; the same project always gets the same.
 * `palette` is the one `tilePalettes` gave it, else the one its id hashes to.
 */
export function tileStyle(projectId: string, palette?: number) {
  const value = hash(projectId);
  const [base, a, b, c] = palettes[palette ?? value % palettes.length]!;
  const [at, bt, ct] = layouts[Math.floor(value / palettes.length) % layouts.length]!;
  return {
    backgroundColor: base,
    backgroundImage: [
      // Light from the top, the way an app icon is lit.
      "linear-gradient(165deg, rgb(255 255 255 / 0.32), rgb(255 255 255 / 0) 48%)",
      `radial-gradient(120% 120% at ${at}, ${a} 0%, transparent 58%)`,
      `radial-gradient(110% 110% at ${bt}, ${b} 0%, transparent 56%)`,
      `radial-gradient(130% 130% at ${ct}, ${c} 0%, transparent 62%)`,
    ].join(", "),
    boxShadow:
      "inset 0 1px 0 rgb(255 255 255 / 0.4), inset 0 -1px 1px rgb(0 0 0 / 0.18), 0 1px 2px rgb(0 0 0 / 0.25)",
  };
}
