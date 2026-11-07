import { useRequest } from "@/hooks/use-request";

import type { FileResponse } from "../types";

const POLL_MS = 5_000;
const KEPT = 50;

const seen = new Map<string, FileResponse>();

function remember(key: string, file: FileResponse) {
  seen.delete(key);
  seen.set(key, file);
  if (seen.size > KEPT) seen.delete(seen.keys().next().value as string);
}

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
