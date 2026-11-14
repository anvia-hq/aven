import type { RecencyGroup, RecencyGroupId, Thread } from "./types";

const DAY_MS = 86_400_000;

const LABELS: Record<RecencyGroupId, string> = {
  today: "Today",
  week: "Last 7 days",
  month: "Last 30 days",
};

function rootOf(thread: Thread, byId: ReadonlyMap<string, Thread>) {
  let current = thread;
  const seen = new Set<string>();
  while (current.parentThreadId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parentThreadId);

    if (!parent) break;

    current = parent;
  }
  return current;
}

export function recencyGroups(threads: readonly Thread[], now = new Date()): RecencyGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const latest = new Map<string, number>();
  for (const thread of threads) {
    const root = rootOf(thread, byId).id;
    latest.set(root, Math.max(latest.get(root) ?? 0, Date.parse(thread.updatedAt)));
  }
  const idOf = (thread: Thread): RecencyGroupId => {
    const at = latest.get(rootOf(thread, byId).id) ?? 0;

    if (at >= startOfToday) return "today";

    return at >= weekAgo ? "week" : "month";
  };
  return (["today", "week", "month"] as const).map((id) => ({
    id,
    label: LABELS[id],
    threads: threads.filter((thread) => idOf(thread) === id),
  }));
}
