import { useCallback, useState } from "react";

import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";

import type { RunSelection } from "../types";
import { useModelSelection } from "./use-model-selection";

// Compacting a thread has its agent's earlier turns summarized (decision 0097): a run of its own
// that needs no sandbox, shown in the thread as `/compact` and a note on what was done. It runs on
// the model the thread's composer shows, unless the caller has another in hand. True once the
// control plane has taken it.
export function useCompactThread(threadId: string) {
  const [compacting, setCompacting] = useState(false);
  const { selection: remembered } = useModelSelection(threadId);

  const compact = useCallback(
    async (selection: RunSelection = remembered) => {
      setCompacting(true);
      const started = await attempt("Could not compact the conversation", () =>
        postJson<{ ok: true }>(`/threads/${threadId}/compact`, selection),
      );
      setCompacting(false);
      if (!started) return false;
      toast.add({
        title: "Compacting",
        description: "The agent is summarizing the conversation so far",
        type: "success",
      });
      return true;
    },
    [threadId, remembered],
  );

  return { compacting, compact };
}
