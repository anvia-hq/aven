import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

import { authClient } from "@/lib/auth-client";
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

// The threads the person can see, most recently updated first: their own as `threads`, and as
// `shared` the ones other people of the workspace shared to read (decision 0084), which the
// server sends and nobody else's. `all` is both, for finding a thread by its address. Loads on
// first use; call `refresh` after changes, or `setRunning` when only a thread's running flag moved.
export function useThreads() {
  const [threads, setThreads] = useAtom(threadsAtom);
  const { data: session } = authClient.useSession();
  const me = session?.user.id;

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

  const all = threads ?? [];
  return {
    threads: all.filter((thread) => thread.createdBy === me),
    shared: all.filter((thread) => thread.createdBy !== me),
    all,
    loaded: threads !== null,
    refresh: threadsStore.refresh,
    setRunning,
  };
}
