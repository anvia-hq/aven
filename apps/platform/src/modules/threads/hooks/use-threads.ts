import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

import { api } from "@/lib/api";

import { threadsAtom } from "../atoms/threads-atom";
import type { Thread } from "../types";

// One in-flight request shared by every component that asks for the list.
let inflight: Promise<Thread[]> | undefined;

// All threads, most recently updated first. Loads on first use; call `refresh` after changes.
export function useThreads() {
  const [threads, setThreads] = useAtom(threadsAtom);

  const refresh = useCallback(async () => {
    inflight ??= api<Thread[]>("/threads").finally(() => {
      inflight = undefined;
    });
    try {
      setThreads(await inflight);
    } catch {
      setThreads((current) => current ?? []);
    }
  }, [setThreads]);

  useEffect(() => {
    if (threads === null) void refresh();
  }, [threads, refresh]);

  return { threads: threads ?? [], loaded: threads !== null, refresh };
}
