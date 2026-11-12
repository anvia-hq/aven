import { useState } from "react";

import { toast } from "@/components/toast";
import { attempt, postJson, api } from "@/lib/api";
import { useRequest } from "@/hooks/use-request";

import type { DecisionModel, DecisionModelDraft } from "../types";

export function useDecisionModel() {
  const [refreshKey, setRefreshKey] = useState(0);
  const answer = useRequest<{ decisionModel: DecisionModel | null }>("/decision-model", {
    refreshKey,
  });

  async function save({ kind, modelId, apiKey }: DecisionModelDraft) {
    const body = { kind, modelId: modelId.trim() || undefined, apiKey: apiKey.trim() || undefined };
    const saved = await attempt("Could not save the decision model", () =>
      postJson<DecisionModel>("/decision-model", body, "PUT"),
    );

    if (!saved) return false;

    toast.add({ title: "Decision model saved", type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  async function remove() {
    const removed = await attempt("Could not remove the decision model", () =>
      api("/decision-model", { method: "DELETE" }),
    );

    if (!removed) return false;

    toast.add({ title: "Decision model removed", type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  return {
    decisionModel: answer?.data?.decisionModel ?? null,
    loaded: answer?.data != null,
    failed: answer?.error ?? null,
    save,
    remove,
  };
}
