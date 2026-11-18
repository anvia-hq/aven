import { attempt, postJson } from "@/lib/api";

import type { Thread } from "../types";
import { useThreads } from "./use-threads";

export function useThreadColors() {
  const { setMarkColor } = useThreads();

  return {
    async setMarkColor(thread: Thread, markColor: string | null) {
      const kept = thread.markColor;
      setMarkColor(thread.id, markColor);
      const updated = await attempt("Could not change the thread's color", () =>
        postJson<Thread>(`/threads/${thread.id}`, { markColor }, "PATCH"),
      );

      if (!updated) {
        setMarkColor(thread.id, kept);
        return;
      }

      setMarkColor(thread.id, updated.markColor);
    },
  };
}
