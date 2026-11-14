import { toast } from "@aven/ui/toast";
import { attempt, postJson } from "@/lib/api";

import type { Thread } from "../types";
import { useThreads } from "./use-threads";

export function useRenameThread() {
  const { setTitle } = useThreads();

  return async function rename(thread: Thread, title: string) {
    const next = title.trim().slice(0, 200);

    if (!next || next === thread.title) return;

    setTitle(thread.id, next);
    const renamed = await attempt("Could not rename the thread", () =>
      postJson<Thread>(`/threads/${thread.id}`, { title: next }, "PATCH"),
    );

    if (!renamed) {
      setTitle(thread.id, thread.title);
      return;
    }

    setTitle(thread.id, renamed.title);
    toast.add({ title: "Thread renamed", description: renamed.title, type: "success" });
  };
}
