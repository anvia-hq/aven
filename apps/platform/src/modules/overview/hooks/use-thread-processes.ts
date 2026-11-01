import type { ProcessView } from "@aven/protocol/runtime-wire";
import { useState } from "react";

import { useRequest } from "@/hooks/use-request";
import { attempt, postJson } from "@/lib/api";

const POLL_MS = 5_000;

// The processes the agent left running in the thread's sandbox (decision 0071), looked at every few
// seconds: they go on after a run, and a sandbox that was freed has none. Stopping one asks the
// runner, with no agent turn, and looks again at once.
export function useThreadProcesses(threadId: string, running: boolean) {
  const [looked, setLooked] = useState(0);
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
  // A run starting or ending is when processes appear or go, so it is looked at again then.
  const answer = useRequest<{ processes: ProcessView[] }>(`/threads/${threadId}/processes`, {
    pollMs: POLL_MS,
    resetOn: threadId,
    refreshKey: `${running}:${looked}`,
  });

  async function stop(processId: string) {
    setStopping((current) => new Set(current).add(processId));
    await attempt("Could not stop the process", () =>
      postJson<{ processes: ProcessView[] }>(
        `/threads/${threadId}/processes/${encodeURIComponent(processId)}/stop`,
        {},
      ),
    );
    setStopping((current) => {
      const rest = new Set(current);
      rest.delete(processId);
      return rest;
    });
    setLooked((count) => count + 1);
  }

  return {
    loaded: answer !== null,
    problem: answer?.error ?? null,
    processes: answer?.data?.processes ?? [],
    stopping,
    stop,
  };
}
