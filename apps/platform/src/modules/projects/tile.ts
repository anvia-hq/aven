// The look of a project's tile: a gradient picked by the project's id, so a project is always the
// same colors and neighbors tend to differ. Like a bot's colors (decision 0062) these are palette
// data kept with the project, not theme colors.

/** Where each gradient starts and ends, drawn from the top left to the bottom right. */
const gradients: readonly (readonly [string, string])[] = [
  ["#ff9f0a", "#ff3b6b"],
  ["#4facfe", "#a855f7"],
  ["#14b8a6", "#22c55e"],
  ["#f472b6", "#8b5cf6"],
  ["#38bdf8", "#2563eb"],
  ["#fbbf24", "#f97316"],
  ["#a3e635", "#16a34a"],
  ["#fb7185", "#e11d48"],
  ["#818cf8", "#06b6d4"],
  ["#c084fc", "#ec4899"],
];

function hash(text: string) {
  let value = 5381;
  for (const character of text) value = (value * 33 + character.codePointAt(0)!) >>> 0;
  return value;
}

/** The first letter or digit of a project's name, in capitals; `?` for a name with neither. */
export function projectInitial(name: string) {
  const match = /[\p{L}\p{N}]/u.exec(name);
  return match ? match[0].toLocaleUpperCase() : "?";
}

/** The gradient and light edge of a project's tile; the same project always gets the same. */
export function tileStyle(projectId: string) {
  const [from, to] = gradients[hash(projectId) % gradients.length]!;
  return {
    backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
    color: "#ffffff",
    boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.35), 0 1px 2px rgb(0 0 0 / 0.25)",
  };
}
