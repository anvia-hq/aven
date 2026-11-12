import type { NestedThread, Thread } from "./types";

export function nestForks(threads: readonly Thread[]): NestedThread[] {
  const ids = new Set(threads.map((thread) => thread.id));
  const forksOf = new Map<string, Thread[]>();
  for (const thread of threads) {
    if (!thread.parentThreadId || !ids.has(thread.parentThreadId)) continue;

    const siblings = forksOf.get(thread.parentThreadId) ?? [];
    siblings.push(thread);
    forksOf.set(thread.parentThreadId, siblings);
  }
  return threads.flatMap((thread) => {
    if (thread.parentThreadId && ids.has(thread.parentThreadId)) return [];

    return [
      { thread, nested: false },
      ...(forksOf.get(thread.id) ?? []).map((fork) => ({ thread: fork, nested: true })),
    ];
  });
}
