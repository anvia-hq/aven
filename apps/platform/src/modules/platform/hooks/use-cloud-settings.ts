import { useState } from "react";

import { toast } from "@aven/ui/toast";
import { useRequest } from "@/hooks/use-request";
import { api, attempt, postJson } from "@/lib/api";

import type { CloudSettings, CloudSettingsDraft } from "../types";

export function useCloudSettings() {
  const [refreshKey, setRefreshKey] = useState(0);
  const answer = useRequest<CloudSettings | null>("/platform/cloud", { refreshKey });

  async function save({ provider, base, runnerUrl, apiKey }: CloudSettingsDraft) {
    const body = {
      provider,
      base: base.trim(),
      runnerUrl: runnerUrl.trim(),
      apiKey: apiKey.trim() || undefined,
    };
    const saved = await attempt("Could not save the sandbox settings", () =>
      postJson<CloudSettings>("/platform/cloud", body, "PUT"),
    );

    if (!saved) return false;

    toast.add({ title: "Sandbox settings saved", type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  async function remove() {
    const removed = await attempt("Could not remove the sandbox settings", () =>
      api("/platform/cloud", { method: "DELETE" }),
    );

    if (!removed) return false;

    toast.add({ title: "Sandbox settings removed", type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  return {
    settings: answer?.data ?? null,
    failed: answer?.error ?? null,
    save,
    remove,
  };
}
