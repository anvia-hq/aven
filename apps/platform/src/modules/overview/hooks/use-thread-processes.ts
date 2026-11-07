import { useState } from "react";

import { useRequest } from "@/hooks/use-request";
import { attempt, postJson } from "@/lib/api";
import type { ProcessView } from "@aven/protocol/types";

const POLL_MS = 5_000;

export function useThreadProcesses(threadId: string, running: boolean) {
  const [looked, setLooked] = useState(0);
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
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
