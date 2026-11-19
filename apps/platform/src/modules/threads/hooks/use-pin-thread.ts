import { api, attempt } from "@/lib/api";

import type { Thread } from "../types";
import { useThreads } from "./use-threads";

export function usePinThread() {
  const { setPinned } = useThreads();

  return async function togglePin(thread: Thread) {
    const next = thread.pinnedAt === null;
    setPinned(thread.id, next ? new Date().toISOString() : null);
    const result = await attempt(
      next ? "Could not pin the thread" : "Could not unpin the thread",
      () =>
        api<{ pinnedAt: string | null }>(`/threads/${thread.id}/pin`, {
          method: next ? "PUT" : "DELETE",
        }),
    );

    if (!result) {
      setPinned(thread.id, thread.pinnedAt);
      return;
    }

    setPinned(thread.id, result.pinnedAt);
  };
}
