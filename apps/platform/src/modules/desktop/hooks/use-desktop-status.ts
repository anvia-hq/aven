import { useState } from "react";

import { useRequest } from "@/hooks/use-request";

import type { Computer } from "../computer";
import type { DesktopStatus } from "../types";

const POLL_MS = 5_000;

// Where a computer's desktop is, refreshed while the caller is mounted: the sandbox comes and goes
// as the agent works and goes idle, without the page doing anything.
export function useDesktopStatus({ path }: Computer) {
  const [refreshCount, setRefreshCount] = useState(0);

  // Every answer is about one computer's desktop; what was known about another says nothing about
  // this one.
  const answer = useRequest<DesktopStatus>(`${path}/desktop`, {
    key: "desktop",
    pollMs: POLL_MS,
    resetOn: path,
    refreshKey: refreshCount,
  });

  // Looks again now, for a caller that has reason to think the answer changed.
  const refresh = () => setRefreshCount((count) => count + 1);

  return { status: answer?.data ?? null, problem: answer?.error ?? null, refresh };
}
