import { useEffect, useState } from "react";

import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";

import { useModelSelection } from "./use-model-selection";
import type { Thread } from "../types";

const RUN_WAIT_MS = 6_000;

export function useShipThread(thread: Thread, showShip: () => () => void) {
  const [shipping, setShipping] = useState(false);
  const { selection } = useModelSelection(thread.id);

  const [waitingForRun, setWaitingForRun] = useState(false);
  const [pullRequestsAtShip, setPullRequestsAtShip] = useState(0);
  useEffect(() => {
    if (!waitingForRun) return;

    if (thread.running || thread.pullRequests.length !== pullRequestsAtShip) {
      setWaitingForRun(false);
      return;
    }

    const timer = setTimeout(() => setWaitingForRun(false), RUN_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waitingForRun, thread.running, thread.pullRequests.length, pullRequestsAtShip]);

  async function ship(mode?: "new") {
    setShipping(true);
    const dropCard = showShip();
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

    if (!started) dropCard();

    if (started) {
      setPullRequestsAtShip(thread.pullRequests.length);
      setWaitingForRun(true);
    }
  }

  return { shipping: shipping || waitingForRun, ship };
}
