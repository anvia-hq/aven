import { useRequest } from "@/hooks/use-request";

import type { FileResponse } from "../types";

const POLL_MS = 5_000;

// One file of a thread's workspace, read when shown and again as the agent works on it. An answer
// that arrives after another file was picked is for the wrong one.
export function useWorkspaceFile(threadId: string, path: string | null, running: boolean) {
  const answer = useRequest<FileResponse>(
    path === null ? null : `/threads/${threadId}/files/content?path=${encodeURIComponent(path)}`,
    { key: path ?? undefined, pollMs: running ? POLL_MS : undefined },
  );
  return {
    loaded: answer !== null,
    file: answer?.data ?? null,
    problem: answer?.error ?? null,
  };
}
