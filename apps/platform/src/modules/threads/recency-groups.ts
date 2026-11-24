import type { RecencyGroup, RecencyGroupId, Thread } from "./types";

const DAY_MS = 86_400_000;

const LABELS: Record<RecencyGroupId, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Last 7 days",
  month: "Last 30 days",
  older: "Older",
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
  const startOfYesterday = startOfToday - DAY_MS;
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const monthAgo = now.getTime() - 30 * DAY_MS;
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const latest = new Map<string, number>();
  for (const thread of threads) {
    const root = rootOf(thread, byId).id;
    latest.set(root, Math.max(latest.get(root) ?? 0, Date.parse(thread.updatedAt)));
  }
  const idOf = (thread: Thread): RecencyGroupId => {
    const at = latest.get(rootOf(thread, byId).id) ?? 0;

    if (at >= startOfToday) return "today";

    if (at >= startOfYesterday) return "yesterday";

    if (at >= weekAgo) return "week";

    if (at >= monthAgo) return "month";

    return "older";
  };
  return (["today", "yesterday", "week", "month", "older"] as const).flatMap((id) => {
    const bucket = threads.filter((thread) => idOf(thread) === id);
    return bucket.length > 0 ? [{ id, label: LABELS[id], threads: bucket }] : [];
  });
}
