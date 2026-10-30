import { useMemo } from "react";

import { useRequest } from "@/hooks/use-request";

import { parsePatch } from "../parse-patch";
import type { DiffScope, ThreadDiffResponse } from "../types";

const POLL_MS = 4_000;

// A thread's changes, read when asked for and again as the agent works: while a run goes on they
// are looked at every few seconds, and once more when it ends. What was shown stays until the new
// answer arrives, so the list does not flicker.
export function useThreadDiff(threadId: string, scope: DiffScope, running: boolean) {
  // `running` changes the polling, so the end of a run is looked at once more. What was known
  // about another thread says nothing about this one.
  const answer = useRequest<ThreadDiffResponse>(`/threads/${threadId}/diff?scope=${scope}`, {
    key: scope,
    pollMs: running ? POLL_MS : undefined,
    resetOn: threadId,
  });

  const response = answer?.data ?? null;
  const patch = response?.available ? response : null;
  const files = useMemo(() => (patch ? parsePatch(patch.patch) : []), [patch]);

  return {
    loaded: answer !== null,
    problem: answer?.error ?? null,
    /** False when the thread has no workspace yet, which is before its first run. */
    available: response ? response.available : null,
    truncated: patch?.truncated ?? false,
    files,
  };
}
