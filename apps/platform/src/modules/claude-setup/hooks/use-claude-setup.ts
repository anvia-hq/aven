import { useState } from "react";

import { toast } from "@aven/ui/toast";
import { useRequest } from "@/hooks/use-request";
import { api, attempt, postJson } from "@/lib/api";

import type { ClaudeSetup } from "../types";

export function useClaudeSetup() {
  const [refreshKey, setRefreshKey] = useState(0);
  const answer = useRequest<ClaudeSetup>("/claude-setup-token", { refreshKey });

  async function save(token: string) {
    const saved = await attempt("Could not save the Claude setup token", () =>
      postJson<ClaudeSetup>("/claude-setup-token", { token }, "PUT"),
    );

    if (!saved) return false;

    toast.add({ title: "Claude setup token saved", type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  async function remove() {
    const removed = await attempt("Could not remove the Claude setup token", () =>
      api("/claude-setup-token", { method: "DELETE" }),
    );

    if (!removed) return false;

    toast.add({ title: "Claude setup token removed", type: "success" });
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
