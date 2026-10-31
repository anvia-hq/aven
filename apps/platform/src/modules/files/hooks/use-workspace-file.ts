import { useRequest } from "@/hooks/use-request";

import type { FileResponse } from "../types";

const POLL_MS = 5_000;
const KEPT = 50;

// The latest answer for each file seen, so a file opened again shows at once while it is read anew.
const seen = new Map<string, FileResponse>();

function remember(key: string, file: FileResponse) {
  seen.delete(key);
  seen.set(key, file);
  if (seen.size > KEPT) seen.delete(seen.keys().next().value as string);
}

// One file of a thread's workspace, read when shown and again as the agent works on it. An answer
// that arrives after another file was picked is for the wrong one.
export function useWorkspaceFile(threadId: string, path: string | null, running: boolean) {
  const answer = useRequest<FileResponse>(
    path === null ? null : `/threads/${threadId}/files/content?path=${encodeURIComponent(path)}`,
    { key: path ?? undefined, pollMs: running ? POLL_MS : undefined },
  );
  const key = `${threadId}\0${path}`;
  if (answer?.data) remember(key, answer.data);
  const file = answer?.data ?? (path === null ? null : (seen.get(key) ?? null));
  return {
    loaded: answer !== null || file !== null,
    file,
    problem: answer?.error ?? null,
  };
}
