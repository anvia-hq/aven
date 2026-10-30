import { useState } from "react";

import { useRequest } from "@/hooks/use-request";

import type { DesktopStatus } from "../types";

const POLL_MS = 5_000;

// Where a thread's desktop is, refreshed while the caller is mounted: the sandbox comes and goes
// as the agent works and goes idle, without the page doing anything.
export function useDesktopStatus(threadId: string) {
  const [refreshCount, setRefreshCount] = useState(0);

  // Every answer is about the thread's one desktop; what was known about another thread says
  // nothing about this one.
  const answer = useRequest<DesktopStatus>(`/threads/${threadId}/desktop`, {
    key: "desktop",
    pollMs: POLL_MS,
    resetOn: threadId,
    refreshKey: refreshCount,
  });

  // Looks again now, for a caller that has reason to think the answer changed.
  const refresh = () => setRefreshCount((count) => count + 1);

  return { status: answer?.data ?? null, problem: answer?.error ?? null, refresh };
}
