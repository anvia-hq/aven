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

export function pickWord(current: string | undefined, random: () => number = Math.random) {
  const others = WORDS.filter((word) => word !== current);
  return others[Math.floor(random() * others.length)]!;
}

export function pauseMs(random: () => number = Math.random) {
  return 2500 + Math.floor(random() * 2500);
}
