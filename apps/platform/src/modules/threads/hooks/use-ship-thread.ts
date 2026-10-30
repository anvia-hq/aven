import { useState } from "react";

import { toast } from "@/components/toast";
import { api, attempt } from "@/lib/api";

import type { Thread } from "../types";

// Shipping a thread sends its agent the ship prompt (decision 0044): the work goes on in the thread,
// where it can be watched, and the pull request shows up once the agent has opened it.
export function useShipThread(thread: Thread) {
  const [shipping, setShipping] = useState(false);

  async function ship() {
    setShipping(true);
    const started = await attempt("Could not ship the thread", () =>
      api<{ ok: true }>(`/threads/${thread.id}/ship`, { method: "POST" }),
    );
    if (started) {
      toast.add({
        title: "Shipping",
        description: "The agent is working on it in this thread",
        type: "success",
      });
    }
    setShipping(false);
  }

  return { shipping, ship };
}
