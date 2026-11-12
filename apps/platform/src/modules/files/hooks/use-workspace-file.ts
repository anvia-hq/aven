import { useEffect, useState } from "react";

import { useRequest } from "@/hooks/use-request";
import { authClient } from "@/lib/auth-client";
import { accountKey, registerUserState } from "@/lib/user-state";

import type { FileResponse } from "../types";

const POLL_MS = 5_000;
const KEPT = 50;

const seen = new Map<string, FileResponse>();

type KeptFile = { key: string; file: FileResponse };

function remember(key: string, file: FileResponse) {
  seen.delete(key);
  seen.set(key, file);

  if (seen.size > KEPT) seen.delete(seen.keys().next().value as string);
}

function keptOf(key: string | null): KeptFile | null {
  if (key === null) return null;

  const file = seen.get(key);
  return file === undefined ? null : { key, file };
}

registerUserState(() => seen.clear());

export function useWorkspaceFile(threadId: string, path: string | null, running: boolean) {
  const { data: session } = authClient.useSession();
  const key = path === null ? null : accountKey(session?.user.id ?? null, `${threadId}\0${path}`);
  const answer = useRequest<FileResponse>(
    path === null ? null : `/threads/${threadId}/files/content?path=${encodeURIComponent(path)}`,
    { key: path ?? undefined, pollMs: running ? POLL_MS : undefined },
  );
  const [kept, setKept] = useState<KeptFile | null>(() => keptOf(key));

  useEffect(() => {
    if (key === null) return;

    const fetched = answer?.data ?? null;

    if (fetched) remember(key, fetched);

    setKept((current) => {
      if (current?.key === key) return current;

      const file = fetched ?? keptOf(key)?.file ?? null;
      return file ? { key, file } : null;
    });
  }, [key, answer]);

  const file = answer?.data ?? (kept?.key === key ? kept.file : null);
  return {
    loaded: answer !== null || file !== null,
    file,
    problem: answer?.error ?? null,
  };
}
