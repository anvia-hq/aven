import type { Thread } from "./types";

export type NestedThread = { thread: Thread; nested: boolean };

// The sidebar's order with each fork right under the thread it was forked from (decision 0135). The
// list is newest first and a parent keeps its place; its forks follow it in that order. A fork
// whose parent is not in the list, archived or not the person's own, stands on its own.
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
