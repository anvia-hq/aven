import { useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { api, attempt, postJson } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { createListStore } from "@/lib/list-store";

import { isOwnerOrAdminRole } from "@/lib/member-role";

import { runtimesAtom } from "../atoms/runtimes-atom";
import { updatingAtom } from "../atoms/updating-atom";
import { isUpdating as isStillUpdating, UPDATE_WAIT_MS, updateEnd } from "../updating";
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
  function change<T>(failureTitle: string, request: () => Promise<T>) {
    return attempt(failureTitle, async () => {
      const result = await request();
      await refresh();
      return result;
    });
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

  // Only an owner or an admin updates a runner; the control plane says the same (decision 0146).
  const { data: member } = authClient.useActiveMember();
  const canUpdate = isOwnerOrAdminRole(member?.role);
  const [updating, setUpdating] = useAtom(updatingAtom);

  // Asks the runner to update itself; true when it agreed (a refusal is already toasted).
  async function update(runtime: Runtime) {
    const agreed = await attempt("Could not update the runner", () =>
      postJson<{ status: string }>(`/runtimes/${runtime.id}/update`, {
        release: runtime.updateTo ?? undefined,
      }),
    );
    if (agreed === null) return false;
    setUpdating((current) => ({
      ...current,
      [runtime.id]: { from: runtime.build, at: Date.now() },
    }));
    return true;
  }

  const isUpdating = (runtime: Runtime) =>
    isStillUpdating(updating[runtime.id], runtime, Date.now());

  const asked = (runtime: Runtime) => updating[runtime.id];
  function finishUpdating(runtime: Runtime) {
    const was = updating[runtime.id];
    const ended = updateEnd(was, runtime, Date.now());
    if (!was || !ended) return;
    setUpdating(({ [runtime.id]: _dropped, ...rest }) => rest);
    if (ended === "failed") {
      toast.add({
        title: "The update did not finish",
        description: `${runtime.name} is still on ${was.from ?? "its release"}. Run aven update on its machine, and check its log.`,
        type: "error",
      });
    }
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
    canUpdate,
    update,
    isUpdating,
    asked,
    finishUpdating,
    updateWaitMs: UPDATE_WAIT_MS,
  };
}
