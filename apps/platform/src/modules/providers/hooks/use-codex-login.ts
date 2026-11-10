import { useCallback, useEffect, useRef, useState } from "react";

import { api, attempt, postJson } from "@/lib/api";

import type { CodexLoginState } from "../types";

const POLL_MS = 2000;

export function useCodexLogin(runtimeId: string | undefined, watching: boolean) {
  const [login, setLogin] = useState<CodexLoginState | null>(null);
  const current = useRef(runtimeId);
  current.current = runtimeId;

  const apply = useCallback((id: string, next: CodexLoginState | null) => {
    if (current.current === id) setLogin(next);
  }, []);

  useEffect(() => {
    setLogin(null);
    if (!runtimeId) return;
    let stopped = false;
    const read = async () => {
      try {
        const next = await api<CodexLoginState>(`/runtimes/${runtimeId}/codex`);
        if (!stopped) apply(runtimeId, next);
      } catch {
        if (!stopped)
          apply(runtimeId, { state: "unavailable", error: "Could not reach the runner" });
      }
    };
    void read();
    if (!watching) return () => void (stopped = true);
    const timer = setInterval(() => void read(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [runtimeId, watching, apply]);

  async function start() {
    if (!runtimeId) return;
    const next = await attempt("Could not start the sign-in", () =>
      postJson<CodexLoginState>(`/runtimes/${runtimeId}/codex/login`, { action: "start" }),
    );
    if (next) apply(runtimeId, next);
  }

  async function cancel() {
    if (!runtimeId) return;
    await postJson(`/runtimes/${runtimeId}/codex/login`, { action: "cancel" }).catch(
      () => undefined,
    );
    apply(runtimeId, { state: "signed-out" });
  }

  return { login, start, cancel };
}
