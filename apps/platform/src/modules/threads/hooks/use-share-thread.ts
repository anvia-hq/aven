import { toast } from "@aven/ui/toast";
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
