import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import type { DesktopStatus } from "../types";

type Poll = { status: DesktopStatus | null; problem: string | null };

const POLL_MS = 5_000;

// Where a thread's desktop is, refreshed while the caller is mounted: the sandbox comes and goes
// as the agent works and goes idle, without the page doing anything.
export function useDesktopStatus(threadId: string) {
  const [poll, setPoll] = useState<Poll>({ status: null, problem: null });

  const refresh = useCallback(async () => {
    try {
      const status = await api<DesktopStatus>(`/threads/${threadId}/desktop`);
      setPoll({ status, problem: null });
    } catch (failure) {
      setPoll({ status: null, problem: errorMessage(failure) });
    }
  }, [threadId]);

  useEffect(() => {
    setPoll({ status: null, problem: null });
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { ...poll, refresh };
}
