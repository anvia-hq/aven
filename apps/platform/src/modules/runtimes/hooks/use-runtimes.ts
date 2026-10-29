import { getDefaultStore, useAtom } from "jotai";
import { useCallback, useEffect } from "react";

import { toast } from "@/components/toast";
import { ApiError, api, postJson } from "@/lib/api";

import { runtimesAtom } from "../atoms/runtimes-atom";
import type { CreatedRuntime, Runtime } from "../types";

// Runtimes are scoped to the active organization: drop them on a switch so the next read refetches.
export function clearRuntimes() {
  getDefaultStore().set(runtimesAtom, null);
}

const messageOf = (failure: unknown) =>
  failure instanceof ApiError ? failure.message : "Could not reach the server";

const POLL_MS = 10_000;

// The organization's runtimes. Loads on first use. With `poll`, online status refreshes while the
// caller is mounted, since a runtime comes and goes without the page doing anything.
export function useRuntimes({ poll = false }: { poll?: boolean } = {}) {
  const [runtimes, setRuntimes] = useAtom(runtimesAtom);

  const refresh = useCallback(async () => {
    try {
      setRuntimes(await api<Runtime[]>("/runtimes"));
    } catch (failure) {
      toast.add({
        title: "Could not load runtimes",
        description: messageOf(failure),
        type: "error",
      });
      setRuntimes((current) => current ?? []);
    }
  }, [setRuntimes]);

  useEffect(() => {
    if (runtimes === null) void refresh();
  }, [runtimes, refresh]);

  useEffect(() => {
    if (!poll) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [poll, refresh]);

  // Returns the new runtime with its token, shown once; null on failure (already toasted).
  async function create(name: string) {
    let created: CreatedRuntime;
    try {
      created = await postJson<CreatedRuntime>("/runtimes", { name });
    } catch (failure) {
      toast.add({ title: "Could not add runtime", description: messageOf(failure), type: "error" });
      return null;
    }
    await refresh();
    return created;
  }

  // Gives the runtime a new token and cuts it off; returns the token, shown once.
  async function rotate(runtime: Runtime) {
    let rotated: CreatedRuntime;
    try {
      rotated = await postJson<CreatedRuntime>(`/runtimes/${runtime.id}/rotate`, {});
    } catch (failure) {
      toast.add({
        title: "Could not rotate token",
        description: messageOf(failure),
        type: "error",
      });
      return null;
    }
    await refresh();
    return rotated;
  }

  async function revoke(runtime: Runtime) {
    try {
      await api<Runtime>(`/runtimes/${runtime.id}`, { method: "DELETE" });
    } catch (failure) {
      toast.add({
        title: "Could not revoke runtime",
        description: messageOf(failure),
        type: "error",
      });
      return;
    }
    await refresh();
    toast.add({ title: "Runtime revoked", description: runtime.name });
  }

  return { runtimes: runtimes ?? [], loaded: runtimes !== null, refresh, create, rotate, revoke };
}
