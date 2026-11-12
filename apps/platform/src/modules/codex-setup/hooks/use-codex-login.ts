import { useState } from "react";

import { toast } from "@/components/toast";
import { useRequest } from "@/hooks/use-request";
import { api, attempt, postJson } from "@/lib/api";

import type { CodexLogin } from "../types";

export function useCodexLogin() {
  const [refreshKey, setRefreshKey] = useState(0);
  const answer = useRequest<CodexLogin>("/codex-login", { refreshKey });

  async function save(login: string) {
    const saved = await attempt("Could not save the ChatGPT login", () =>
      postJson<CodexLogin>("/codex-login", { login }, "PUT"),
    );

    if (!saved) return false;

    toast.add({ title: "ChatGPT login saved", type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  async function remove() {
    const removed = await attempt("Could not remove the ChatGPT login", () =>
      api("/codex-login", { method: "DELETE" }),
    );

    if (!removed) return false;

    toast.add({ title: "ChatGPT login removed", type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  return {
    login: answer?.data ?? null,
    loaded: answer?.data != null,
    failed: answer?.error ?? null,
    save,
    remove,
  };
}
