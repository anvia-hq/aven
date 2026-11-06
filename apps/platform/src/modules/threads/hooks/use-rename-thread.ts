import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";

import type { Thread } from "../types";
import { useThreads } from "./use-threads";

// A thread's title is its creator's to change. The sidebar shows the new one at once and puts the old
// one back when the server refuses.
export function useRenameThread() {
  const { setTitle, refresh } = useThreads();

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
    toast.add({ title: "Thread renamed", description: next, type: "success" });
    await refresh();
  };
}
