import type { RecencyGroup, Thread } from "./types";

function highestPin(thread: Thread, byId: ReadonlyMap<string, Thread>): string | null {
  let current: Thread | undefined = thread;
  let highest: string | null = null;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);

    if (current.pinnedAt !== null) highest = current.id;

    current = current.parentThreadId ? byId.get(current.parentThreadId) : undefined;
  }
  return highest;
}

export function splitPinned(threads: readonly Thread[]): {
  pinned: Thread[];
  pinnedIds: Set<string>;
} {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const families = new Map<string, Thread[]>();
  const newestPin = new Map<string, number>();
  for (const thread of threads) {
    const root = highestPin(thread, byId);

    if (!root) continue;

    const members = families.get(root) ?? [];

    members.push(thread);
    families.set(root, members);

    if (thread.pinnedAt !== null) {
      newestPin.set(root, Math.max(newestPin.get(root) ?? 0, Date.parse(thread.pinnedAt)));
    }
  }
  const ordered = [...families].sort(
    ([a], [b]) => (newestPin.get(b) ?? 0) - (newestPin.get(a) ?? 0),
  );
  const pinned: Thread[] = [];
  const pinnedIds = new Set<string>();
  for (const [root, members] of ordered) {
    const rootThread = byId.get(root);

    if (rootThread && !pinnedIds.has(rootThread.id)) {
      pinned.push(rootThread);
      pinnedIds.add(rootThread.id);
    }

    for (const member of members) {
      if (member.id === root || pinnedIds.has(member.id)) continue;

      pinned.push(member);
      pinnedIds.add(member.id);
    }
  }
  return { pinned, pinnedIds };
}

export function withoutPinned(
  groups: readonly RecencyGroup[],
  pinnedIds: ReadonlySet<string>,
): RecencyGroup[] {
  return groups.flatMap((group) => {
    const remaining = group.threads.filter((thread) => !pinnedIds.has(thread.id));
    return remaining.length > 0 ? [{ ...group, threads: remaining }] : [];
  });
}
