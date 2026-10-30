import { useEffect, useMemo, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import { parsePatch } from "../parse-patch";
import type { DiffScope, ThreadDiffResponse } from "../types";

const POLL_MS = 4_000;

type Answer =
  | { scope: DiffScope; response: ThreadDiffResponse }
  | { scope: DiffScope; problem: string };

// A thread's changes, read when asked for and again as the agent works: while a run goes on they
// are looked at every few seconds, and once more when it ends. What was shown stays until the new
// answer arrives, so the list does not flicker.
export function useThreadDiff(threadId: string, scope: DiffScope, running: boolean) {
  const [answer, setAnswer] = useState<Answer | null>(null);

  // What was known about another thread says nothing about this one.
  useEffect(() => setAnswer(null), [threadId]);

  useEffect(() => {
    // An answer that arrives after the thread or scope changed is for the wrong one.
    let current = true;
    const look = async () => {
      try {
        const response = await api<ThreadDiffResponse>(`/threads/${threadId}/diff?scope=${scope}`);
        if (current) setAnswer({ scope, response });
      } catch (failure) {
        if (current) setAnswer({ scope, problem: errorMessage(failure) });
      }
    };
    void look();
    const timer = running ? setInterval(() => void look(), POLL_MS) : undefined;
    return () => {
      current = false;
      clearInterval(timer);
    };
    // `running` is a dependency so the end of a run is looked at once more.
  }, [threadId, scope, running]);

  const shown = answer?.scope === scope ? answer : null;
  const patch = shown && "response" in shown && shown.response.available ? shown.response : null;
  const files = useMemo(() => (patch ? parsePatch(patch.patch) : []), [patch]);

  return {
    loaded: shown !== null,
    problem: shown && "problem" in shown ? shown.problem : null,
    /** False when the thread has no workspace yet, which is before its first run. */
    available: shown && "response" in shown ? shown.response.available : null,
    truncated: patch?.truncated ?? false,
    files,
  };
}
