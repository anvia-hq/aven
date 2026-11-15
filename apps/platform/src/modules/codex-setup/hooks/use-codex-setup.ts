import { useState } from "react";

import { toast } from "@aven/ui/toast";
import { useRequest } from "@/hooks/use-request";
import { api, attempt, postJson } from "@/lib/api";

import type { CodexSetup } from "../types";

export function useCodexSetup() {
  const [refreshKey, setRefreshKey] = useState(0);
  const answer = useRequest<CodexSetup>("/codex-setup-token", { refreshKey });

  async function save(token: string) {
    const saved = await attempt("Could not save the Codex API key", () =>
      postJson<CodexSetup>("/codex-setup-token", { token }, "PUT"),
    );

    if (!saved) return false;

    toast.add({ title: "Codex API key saved", type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  async function remove() {
    const removed = await attempt("Could not remove the Codex API key", () =>
      api("/codex-setup-token", { method: "DELETE" }),
    );

    if (!removed) return false;

    toast.add({ title: "Codex API key removed", type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  return {
    setup: answer?.data ?? { configured: false, hint: null },
    loaded: answer?.data != null,
    failed: answer?.error ?? null,
    save,
    remove,
  };
}
