import { useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { api, errorMessage, postJson } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { createListStore } from "@/lib/list-store";

import { runtimesAtom } from "../atoms/runtimes-atom";
import type { CreatedRuntime, Runtime } from "../types";

const runtimesStore = createListStore<Runtime>({
  path: "/runtimes",
  atom: runtimesAtom,
  label: "runtimes",
});

// Runtimes are scoped to the active organization: drop them on a switch or sign-out so the next
// read refetches.
export const resetRuntimes = runtimesStore.reset;

const POLL_MS = 10_000;

// The organization's runtimes. Loads on first use. With `poll`, online status refreshes while the
// caller is mounted, since a runtime comes and goes without the page doing anything.
export function useRuntimes({ poll = false }: { poll?: boolean } = {}) {
  const [runtimes] = useAtom(runtimesAtom);
  const { data: session } = authClient.useSession();
  const { refresh } = runtimesStore;

  useEffect(() => {
    if (runtimes === null) void refresh();
  }, [runtimes, refresh]);

  useEffect(() => {
    if (!poll) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [poll, refresh]);

  // The first runtime that is online, else the first at all: where a new project should go.
  const defaultRunner = (runtimes ?? []).find((runtime) => runtime.online) ?? runtimes?.[0];

  // Only the owner can rotate or revoke a runtime.
  const isOwnedByMe = (runtime: Runtime) => runtime.ownerId === session?.user.id;

  // Runs a request that changes a runtime and reloads the list; null on failure (already toasted).
  async function change<T>(failureTitle: string, request: () => Promise<T>) {
    try {
      const result = await request();
      await refresh();
      return result;
    } catch (failure) {
      toast.add({ title: failureTitle, description: errorMessage(failure), type: "error" });
      return null;
    }
  }

  // Returns the new runtime with its token, shown once.
  function create(name: string) {
    return change("Could not add runtime", () => postJson<CreatedRuntime>("/runtimes", { name }));
  }

  // Gives the runtime a new token and cuts it off; returns the token, shown once.
  function rotate(runtime: Runtime) {
    return change("Could not rotate token", () =>
      postJson<CreatedRuntime>(`/runtimes/${runtime.id}/rotate`, {}),
    );
  }

  async function revoke(runtime: Runtime) {
    const revoked = await change("Could not revoke runtime", () =>
      api<Runtime>(`/runtimes/${runtime.id}`, { method: "DELETE" }),
    );
    if (revoked !== null) toast.add({ title: "Runtime revoked", description: runtime.name });
  }

  return {
    runtimes: runtimes ?? [],
    loaded: runtimes !== null,
    defaultRunner,
    isOwnedByMe,
    refresh,
    create,
    rotate,
    revoke,
  };
}
