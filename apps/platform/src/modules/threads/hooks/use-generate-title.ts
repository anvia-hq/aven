import { toast } from "@aven/ui/toast";
import { errorMessage, postJson } from "@/lib/api";

import type { Thread } from "../types";
import { useThreads } from "./use-threads";

export function useGenerateTitle() {
  const { setTitle } = useThreads();

  return function generateTitle(thread: Thread) {
    void toast
      .promise(postJson<Thread>(`/threads/${thread.id}/title`, {}), {
        loading: { title: "Writing a title…", description: thread.title },
        success: (titled) => ({ title: "Title updated", description: titled.title }),
        error: (failure) => ({
          title: "Could not generate a title",
          description: errorMessage(failure),
        }),
      })
      .then((titled) => setTitle(thread.id, titled.title))
      .catch(() => undefined);
  };
}
