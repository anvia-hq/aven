import { useEffect, useState } from "react";

import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";

import { useModelSelection } from "./use-model-selection";
import type { Thread } from "../types";

// How long Shipping waits for the run to show before it gives the button back.
const RUN_WAIT_MS = 6_000;

// Shipping a thread sends its agent the ship prompt (decision 0044): the work goes on in the thread,
// where it can be watched, and the pull request shows up once the agent has opened it. Without a
// mode, the thread's newest pull request decides between updating it and opening a new one (0069).
export function useShipThread(thread: Thread) {
  const [shipping, setShipping] = useState(false);
  // The model the thread's composer shows, so shipping runs on it and not on the default provider.
  const { selection } = useModelSelection(thread.id);

  // The request is answered before the run's first event reaches this page: Shipping stays until
  // the thread shows as running (or, should no run come, a little while), so the button does not
  // fall back to Ship in between.
  const [waitingForRun, setWaitingForRun] = useState(false);
  const [pullRequestsAtShip, setPullRequestsAtShip] = useState(0);
  useEffect(() => {
    if (!waitingForRun) return;
    // A run too short to be seen going has still ended by the time its pull request is listed.
    if (thread.running || thread.pullRequests.length !== pullRequestsAtShip) {
      setWaitingForRun(false);
      return;
    }
    const timer = setTimeout(() => setWaitingForRun(false), RUN_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waitingForRun, thread.running, thread.pullRequests.length, pullRequestsAtShip]);

  async function ship(mode?: "new") {
    setShipping(true);
    const started = await attempt("Could not ship the thread", () =>
      postJson<{ ok: true }>(`/threads/${thread.id}/ship`, { ...selection, mode }),
    );
    if (started) {
      toast.add({
        title: "Shipping",
        description: "The agent is working on it in this thread",
        type: "success",
      });
    }
    setShipping(false);
    if (started) {
      setPullRequestsAtShip(thread.pullRequests.length);
      setWaitingForRun(true);
    }
  }

  return { shipping: shipping || waitingForRun, ship };
}
