import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

import { createListStore } from "@/lib/list-store";

import { threadsAtom } from "../atoms/threads-atom";
import type { Thread } from "../types";

const threadsStore = createListStore<Thread>({
  path: "/threads",
  atom: threadsAtom,
  label: "threads",
});

// Threads are scoped to the active organization: drop them on a switch or sign-out so the next
// read refetches for whoever is now active.
export const resetThreads = threadsStore.reset;

// All threads, most recently updated first. Loads on first use; call `refresh` after changes, or
// `setRunning` when only a thread's running flag moved.
export function useThreads() {
  const [threads, setThreads] = useAtom(threadsAtom);

  useEffect(() => {
    if (threads === null) void threadsStore.refresh();
  }, [threads]);

  const setRunning = useCallback(
    (threadId: string, running: boolean) =>
      setThreads(
        (current) =>
          current?.map((thread) => (thread.id === threadId ? { ...thread, running } : thread)) ??
          current,
      ),
    [setThreads],
  );

  return {
    threads: threads ?? [],
    loaded: threads !== null,
    refresh: threadsStore.refresh,
    setRunning,
  };
}
