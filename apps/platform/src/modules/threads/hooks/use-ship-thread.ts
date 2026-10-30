import { useState } from "react";

import { api, attempt } from "@/lib/api";
import { toast } from "@/components/toast";

import type { Thread } from "../types";
import { useThreads } from "./use-threads";

type PullRequest = { number: number; url: string; created: boolean };

// Publishing a thread's work as a pull request (decision 0040): the server commits and pushes the
// thread's branch and opens the pull request, or finds the one already open.
export function useShipThread(thread: Thread) {
  const { refresh } = useThreads();
  const [shipping, setShipping] = useState(false);

  async function ship() {
    setShipping(true);
    const pullRequest = await attempt("Could not ship the thread", () =>
      api<PullRequest>(`/threads/${thread.id}/ship`, { method: "POST" }),
    );
    if (pullRequest) {
      toast.add({
        title: pullRequest.created ? "Pull request opened" : "Pull request updated",
        description: `#${pullRequest.number}`,
        type: "success",
      });
      await refresh();
    }
    setShipping(false);
  }

  return { shipping, ship };
}
