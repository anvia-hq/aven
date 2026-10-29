import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import type { DesktopStatus } from "../types";

type Poll = { status: DesktopStatus | null; problem: string | null };

const POLL_MS = 5_000;

// Where a thread's desktop is, refreshed while the caller is mounted: the sandbox comes and goes
// as the agent works and goes idle, without the page doing anything.
export function useDesktopStatus(threadId: string) {
  const [poll, setPoll] = useState<Poll>({ status: null, problem: null });

  const [refreshCount, setRefreshCount] = useState(0);

  // What was known about another thread says nothing about this one.
  useEffect(() => setPoll({ status: null, problem: null }), [threadId]);

  useEffect(() => {
    // An answer that arrives after the thread changed is for the wrong thread.
    let current = true;
    const look = async () => {
      try {
        const status = await api<DesktopStatus>(`/threads/${threadId}/desktop`);
        if (current) setPoll({ status, problem: null });
      } catch (failure) {
        if (current) setPoll({ status: null, problem: errorMessage(failure) });
      }
    };
    void look();
    const timer = setInterval(() => void look(), POLL_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [threadId, refreshCount]);

  // Looks again now, for a caller that has reason to think the answer changed.
  const refresh = () => setRefreshCount((count) => count + 1);

  return { ...poll, refresh };
}
