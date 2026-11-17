import { useState } from "react";

import { toast } from "@aven/ui/toast";
import { useRequest } from "@/hooks/use-request";
import { api, attempt, postJson } from "@/lib/api";

import type { LensSettings, LensSettingsDraft } from "../types";

export function useLensSettings() {
  const [refreshKey, setRefreshKey] = useState(0);
  const answer = useRequest<LensSettings | null>("/platform/lens", { refreshKey });

  async function save({ baseUrl, publicKey, secretKey, captureMode }: LensSettingsDraft) {
    const body = {
      baseUrl: baseUrl.trim(),
      publicKey: publicKey.trim(),
      secretKey: secretKey.trim() || undefined,
      captureMode,
    };
    const saved = await attempt("Could not save the Anvia Lens settings", () =>
      postJson<LensSettings>("/platform/lens", body, "PUT"),
    );

    if (!saved) return false;

    toast.add({ title: "Anvia Lens settings saved", type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  async function remove() {
    const removed = await attempt("Could not remove the Anvia Lens settings", () =>
      api("/platform/lens", { method: "DELETE" }),
    );

    if (!removed) return false;

    toast.add({ title: "Anvia Lens settings removed", type: "success" });
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
