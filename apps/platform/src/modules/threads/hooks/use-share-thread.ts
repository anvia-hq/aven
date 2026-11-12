import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";

import type { Thread, ThreadVisibility } from "../types";
import { useThreads } from "./use-threads";

export function useShareThread() {
  const { refresh } = useThreads();

  return async function share(thread: Thread, visibility: ThreadVisibility) {
    if (thread.visibility === visibility) return;

    const updated = await attempt("Could not change who can see the thread", () =>
      postJson<Thread>(`/threads/${thread.id}`, { visibility }, "PATCH"),
    );

    if (!updated) return;

    toast.add({
      title: visibility === "workspace" ? "Shared with the workspace" : "Only you can see it now",
      description: thread.title,
      type: "success",
    });
    await refresh();
  };
}

export function useDriveThread() {
  const { refresh } = useThreads();

  return async function drive(thread: Thread, days: number | null) {
    const updated = await attempt("Could not change multiplayer", () =>
      postJson<Thread>(`/threads/${thread.id}`, { driving: days }, "PATCH"),
    );

    if (!updated) return;

    toast.add({
      title: days === null ? "Multiplayer is off" : `Teammates can message it for ${days} days`,
      description: thread.title,
      type: "success",
    });
    await refresh();
  };
}
