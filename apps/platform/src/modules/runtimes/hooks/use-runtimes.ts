import { useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { api, attempt, postJson } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { createListStore } from "@/lib/list-store";

import { isOwnerOrAdminRole } from "@/lib/member-role";

import { runtimesAtom } from "../atoms/runtimes-atom";
import { updatingAtom } from "../atoms/updating-atom";
import type { CreatedRuntime, Runtime } from "../types";

const runtimesStore = createListStore<Runtime>({
  path: "/runtimes",
  atom: runtimesAtom,
  label: "runtimes",
});

export const resetRuntimes = runtimesStore.reset;

const POLL_MS = 10_000;
const UPDATE_WAIT_MS = 5 * 60_000;

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

  const defaultRunner = (runtimes ?? []).find((runtime) => runtime.online) ?? runtimes?.[0];

  const isOwnedByMe = (runtime: Runtime) => runtime.ownerId === session?.user.id;

  function change<T>(failureTitle: string, request: () => Promise<T>) {
    return attempt(failureTitle, async () => {
      const result = await request();
      await refresh();
      return result;
    });
  }

  function create(name: string) {
    return change("Could not add runtime", () => postJson<CreatedRuntime>("/runtimes", { name }));
  }

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

  const { data: member } = authClient.useActiveMember();
  const canUpdate = isOwnerOrAdminRole(member?.role);
  const [updating, setUpdating] = useAtom(updatingAtom);

  async function update(runtime: Runtime) {
    const agreed = await attempt("Could not update the runner", () =>
      postJson<{ status: string }>(`/runtimes/${runtime.id}/update`, {}),
    );
    if (agreed === null) return false;
    setUpdating((current) => ({
      ...current,
      [runtime.id]: { from: runtime.build, at: Date.now() },
    }));
    return true;
  }

  const isUpdating = (runtime: Runtime) => {
    const asked = updating[runtime.id];
    if (!asked || Date.now() - asked.at > UPDATE_WAIT_MS) return false;
    return !runtime.online || runtime.build === asked.from;
  };

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
  };
}
