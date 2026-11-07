import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";

import type { Thread } from "../types";
import { useModelSelection } from "./use-model-selection";
import { useThreads } from "./use-threads";

export function useContinueThread(thread: Thread) {
  const navigate = useNavigate();
  const { refresh } = useThreads();
  const [working, setWorking] = useState(false);
  const { selection } = useModelSelection(thread.id);

  async function continueOn(runtimeId: string) {
    setWorking(true);
    let created: Thread | null;
    try {
      created = await attempt("Could not continue the thread", () =>
        postJson<Thread>(`/threads/${thread.id}/continue`, { runtimeId, ...selection }),
      );
    } finally {
      setWorking(false);
    }
    if (!created) return false;
    toast.add({ title: "Continued on another runner", description: thread.title, type: "success" });
    await navigate({ to: "/threads/$threadId", params: { threadId: created.id } });
    void refresh();
    return true;
  }

  return { continueOn, working };
}
