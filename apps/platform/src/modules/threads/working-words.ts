// The words the working indicator takes turns showing while the agent works: each one stands for
// the work in progress, none for anything the agent is really doing.
export const WORDS = [
  "Pondering",
  "Noodling",
  "Tinkering",
  "Brewing",
  "Conjuring",
  "Untangling",
  "Whittling",
  "Percolating",
  "Cogitating",
  "Marinating",
  "Scheming",
  "Wrangling",
  "Simmering",
  "Mulling",
  "Hatching",
  "Forging",
  "Sleuthing",
  "Churning",
  "Doodling",
  "Fiddling",
  "Rummaging",
  "Puzzling",
  "Sculpting",
  "Distilling",
  "Foraging",
  "Juggling",
  "Kneading",
  "Plotting",
  "Polishing",
  "Riffing",
  "Stitching",
  "Unspooling",
  "Whirring",
  "Spelunking",
  "Tuning",
] as const;

/** A word other than `current`, so the indicator always visibly changes. `random` gives [0, 1). */
export function pickWord(current: string | undefined, random: () => number = Math.random) {
  const others = WORDS.filter((word) => word !== current);
  return others[Math.floor(random() * others.length)]!;
}

/** How long to keep a word: between 2.5 and 5 seconds, a little different every time. */
export function pauseMs(random: () => number = Math.random) {
  return 2500 + Math.floor(random() * 2500);
}
