import { useSetAtom } from "jotai";

import { toast } from "@/components/toast";

import { threadsAtom } from "../atoms/threads-atom";
import type { Thread } from "../types";

// Archive and snooze are just state changes on the mock thread.
export function useThreadActions() {
  const setThreads = useSetAtom(threadsAtom);

  function setState(threadId: string, state: Thread["state"], message: string) {
    setThreads((threads) =>
      threads.map((thread) => (thread.id === threadId ? { ...thread, state } : thread)),
    );
    toast.add({ title: message, type: "success" });
  }

  return {
    archive: (threadId: string) => setState(threadId, "archived", "Thread archived"),
    snooze: (threadId: string) => setState(threadId, "snoozed", "Thread snoozed"),
    reopen: (threadId: string) => setState(threadId, "open", "Thread reopened"),
  };
}
