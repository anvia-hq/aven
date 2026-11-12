import { useState } from "react";

import { toast } from "@/components/toast";
import { useRequest } from "@/hooks/use-request";
import { api, attempt, postJson } from "@/lib/api";

import type { ServerModel, ServerModelDraft, ServerModels } from "../types";

type Which = "decision" | "small";

const LABELS: Record<Which, string> = { decision: "decision model", small: "small model" };

export function useServerModels() {
  const [refreshKey, setRefreshKey] = useState(0);
  const answer = useRequest<ServerModels>("/platform/server-models", { refreshKey });

  async function save(which: Which, { kind, modelId, apiKey }: ServerModelDraft) {
    const body = { kind, modelId: modelId.trim() || undefined, apiKey: apiKey.trim() || undefined };
    const saved = await attempt(`Could not save the default ${LABELS[which]}`, () =>
      postJson<ServerModel>(`/platform/server-models/${which}`, body, "PUT"),
    );

    if (!saved) return false;

    toast.add({ title: `Default ${LABELS[which]} saved`, type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  async function remove(which: Which) {
    const removed = await attempt(`Could not remove the default ${LABELS[which]}`, () =>
      api(`/platform/server-models/${which}`, { method: "DELETE" }),
    );

    if (!removed) return false;

    toast.add({ title: `Default ${LABELS[which]} removed`, type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  return {
    models: answer?.data ?? null,
    failed: answer?.error ?? null,
    save,
    remove,
  };
}
