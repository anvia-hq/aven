import type { CommitEntry } from "./hooks/use-center-feed";

export type DayGroup = { key: string; label: string; entries: CommitEntry[] };

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function groupByDay(entries: CommitEntry[], now = new Date()): DayGroup[] {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups: DayGroup[] = [];
  for (const entry of entries) {
    const time = Date.parse(entry.commit.date);
    if (Number.isNaN(time)) continue;
    const date = new Date(time);
    const key = dayKey(date);
    let group = groups.at(-1);
    if (group?.key !== key) {
      let label = date.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
      });
      if (key === today) label = "Today";
      if (key === yesterday) label = "Yesterday";
      group = { key, label, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}
