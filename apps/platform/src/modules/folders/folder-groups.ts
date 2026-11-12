import type { Thread } from "../threads/types";
import type { Folder, FolderedThreads } from "./types";

export function rootOf(thread: Thread, threads: readonly Thread[]): Thread {
  let current = thread;
  const seen = new Set<string>();
  while (current.parentThreadId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = threads.find((candidate) => candidate.id === current.parentThreadId);

    if (!parent) break;

    current = parent;
  }
  return current;
}

export function groupThreads(
  threads: readonly Thread[],
  folders: readonly Folder[],
): FolderedThreads {
  const folderOf = new Map<string, string>();
  for (const folder of folders) {
    for (const id of folder.threadIds) folderOf.set(id, folder.id);
  }
  const placed = (thread: Thread) => folderOf.get(rootOf(thread, threads).id);
  return {
    groups: folders.map((folder) => ({
      folder,
      threads: threads.filter((thread) => placed(thread) === folder.id),
    })),
    unfiled: threads.filter((thread) => placed(thread) === undefined),
  };
}
