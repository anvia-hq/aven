import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

import { toast } from "@/components/toast";
import { ApiError, api } from "@/lib/api";

import { threadsAtom } from "../atoms/threads-atom";
import type { Thread } from "../types";

// One in-flight request shared by every component that asks for the list.
let inflight: Promise<Thread[]> | undefined;
// Bumped by `invalidateThreads` (on an organization switch) so a response for the previous
// organization's request, resolving after the switch, can't overwrite the new one's data.
let generation = 0;

// Drops any in-flight request and the atom's cached value, so the next read refetches for
// whichever organization is now active.
export function invalidateThreads() {
  inflight = undefined;
  generation += 1;
}

// All threads, most recently updated first. Loads on first use; call `refresh` after changes.
export function useThreads() {
  const [threads, setThreads] = useAtom(threadsAtom);

  const refresh = useCallback(async () => {
    const thisGeneration = generation;
    inflight ??= api<Thread[]>("/threads").finally(() => {
      inflight = undefined;
    });
    try {
      const result = await inflight;
      if (thisGeneration !== generation) return;
      setThreads(result);
    } catch (failure) {
      if (thisGeneration !== generation) return;
      const message = failure instanceof ApiError ? failure.message : "Could not reach the server";
      toast.add({ title: "Could not load threads", description: message, type: "error" });
      setThreads((current) => current ?? []);
    }
  }, [setThreads]);

  useEffect(() => {
    if (threads === null) void refresh();
  }, [threads, refresh]);

  return { threads: threads ?? [], loaded: threads !== null, refresh };
}
