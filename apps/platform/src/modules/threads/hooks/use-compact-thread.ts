import { useCallback, useState } from "react";

import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";

import type { RunSelection } from "../types";
import { useModelSelection } from "./use-model-selection";

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
