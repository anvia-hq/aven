import { toast } from "@aven/ui/toast";
import { attempt, postJson } from "@/lib/api";

import type { Thread } from "../types";
import { useThreads } from "./use-threads";

export function useRestoreThread() {
  const { refresh } = useThreads();

  return async function restore(thread: Thread) {
    const restored = await attempt("Could not restore the thread", () =>
      postJson<Thread>(`/threads/${thread.id}`, { state: "open" }, "PATCH"),
    );

    if (!restored) return;

    toast.add({ title: "Thread restored", description: thread.title, type: "success" });

    await refresh();
  };
}
