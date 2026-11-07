import type { ProcessLogs } from "@aven/protocol/runtime-wire";

import { useRequest } from "@/hooks/use-request";

const POLL_MS = 3_000;

export function useProcessLogs(threadId: string, processId: string, open: boolean, live: boolean) {
  const answer = useRequest<ProcessLogs>(
    open ? `/threads/${threadId}/processes/${encodeURIComponent(processId)}/logs` : null,
    { pollMs: live ? POLL_MS : undefined },
  );
  return { logs: answer?.data ?? null, problem: answer?.error ?? null };
}
