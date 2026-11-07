import { getDefaultStore, useAtom } from "jotai";
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

export const resetThreads = threadsStore.reset;

export function useThreads() {
  const [threads, setThreads] = useAtom(threadsAtom);
  const { data: session } = authClient.useSession();
  const me = session?.user.id;

  useEffect(() => {
    if (threads === null) void threadsStore.refresh();
  }, [threads]);

  useEffect(() => {
    if (getDefaultStore().get(threadsAtom) !== null) void threadsStore.refresh();
  }, []);

  const setRunning = useCallback(
    (threadId: string, running: boolean) =>
      setThreads(
        (current) =>
          current?.map((thread) => (thread.id === threadId ? { ...thread, running } : thread)) ??
          current,
      ),
    [setThreads],
  );

  const add = useCallback(
    (thread: Thread) =>
      setThreads((current) => [thread, ...(current ?? []).filter(({ id }) => id !== thread.id)]),
    [setThreads],
  );

  const setTitle = useCallback(
    (threadId: string, title: string) =>
      setThreads(
        (current) =>
          current?.map((thread) => (thread.id === threadId ? { ...thread, title } : thread)) ??
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
    setTitle,
    add,
  };
}
