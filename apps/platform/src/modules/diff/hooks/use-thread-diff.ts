import { useCallback, useMemo, useRef, useState } from "react";

import { useRequest } from "@/hooks/use-request";

import { parsePatch } from "../parse-patch";
import { sameFile } from "../same-file";
import type { DiffFile, ThreadDiffResponse, ThreadDiffScope } from "../types";

const POLL_MS = 4_000;

export function useThreadDiff(
  threadId: string,
  scope: ThreadDiffScope,
  running: boolean,
  enabled = true,
) {
  const [reads, setReads] = useState(0);
  const answer = useRequest<ThreadDiffResponse>(
    enabled ? `/threads/${threadId}/diff?scope=${scope}` : null,
    {
      key: `${threadId}/${scope}/${reads}`,
      pollMs: running ? POLL_MS : undefined,
      resetOn: threadId,
    },
  );

  const response = answer?.data ?? null;
  const patch = response?.available ? response : null;
  const text = patch?.patch ?? null;
  const before = useRef<DiffFile[]>([]);
  const files = useMemo(() => {
    const parsed = text === null ? [] : parsePatch(text);
    const kept = parsed.map(
      (file) => before.current.find((known) => sameFile(known, file)) ?? file,
    );
    before.current = kept;
    return kept;
  }, [text]);

  const additions = useMemo(() => files.reduce((sum, file) => sum + file.additions, 0), [files]);
  const deletions = useMemo(() => files.reduce((sum, file) => sum + file.deletions, 0), [files]);

  const reload = useCallback(() => setReads((count) => count + 1), []);

  return {
    loaded: answer !== null,
    problem: answer?.error ?? null,
    available: response ? response.available : null,
    truncated: patch?.truncated ?? false,
    files,
    additions,
    deletions,
    reload,
  };
}
