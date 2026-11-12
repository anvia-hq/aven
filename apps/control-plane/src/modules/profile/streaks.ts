const DAY_MS = 86_400_000;

const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);

const startOf = (day: string) => Date.parse(`${day}T00:00:00Z`);

export function streaksOf(days: readonly string[], today: string) {
  const unique = [...new Set(days)].sort();
  let longest = 0;
  let run = 0;
  let previous: number | undefined;
  for (const day of unique) {
    const time = startOf(day);

    if (!Number.isFinite(time)) continue;

    run = previous !== undefined && time - previous === DAY_MS ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = time;
  }

  const active = new Set(unique);
  let current = 0;
  let cursor = startOf(today);

  if (!active.has(dayOf(cursor))) cursor -= DAY_MS;

  while (active.has(dayOf(cursor))) {
    current += 1;
    cursor -= DAY_MS;
  }
  return { current, longest };
}
