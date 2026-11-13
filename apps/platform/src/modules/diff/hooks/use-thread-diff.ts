import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import { parsePatch } from "../parse-patch";
import { sameFile } from "../same-file";
import type { DiffFile, ThreadDiffResponse, ThreadDiffScope } from "../types";

const POLL_MS = 4_000;

type KeptAnswer = {
  threadId: string;
  scope: ThreadDiffScope;
  loaded: ThreadDiffResponse | string;
};

export function useThreadDiff(
  threadId: string,
  scope: ThreadDiffScope,
  running: boolean,
  enabled = true,
) {
  const [reads, setReads] = useState(0);
  const [answer, setAnswer] = useState<KeptAnswer | null>(null);
  const kept = useRef(new Map<string, ThreadDiffResponse>());

  useEffect(() => {
    setAnswer(null);
    kept.current.clear();
  }, [threadId]);

  useEffect(() => {
    if (!enabled) return;

    let current = true;
    const path = `/threads/${threadId}/diff?scope=${scope}`;
    const look = async () => {
      try {
        const data = await api<ThreadDiffResponse>(path);

        if (current) {
          if (data.available) kept.current.set(scope, data);
          else kept.current.delete(scope);

          setAnswer({ threadId, scope, loaded: data });
        }
      } catch (failure) {
        if (current) setAnswer({ threadId, scope, loaded: errorMessage(failure) });
      }
    };
    void look();
    const timer = running ? setInterval(() => void look(), POLL_MS) : undefined;
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [threadId, scope, reads, running, enabled]);

  const live =
    enabled && answer !== null && answer.threadId === threadId && answer.scope === scope
      ? answer.loaded
      : null;
  const stale = answer !== null && answer.threadId === threadId ? answer.loaded : null;
  const cached = live === null ? (kept.current.get(scope) ?? null) : null;
  const shown = live ?? cached ?? stale;
  const problem = typeof shown === "string" ? shown : null;
  const response = typeof shown === "object" ? shown : null;
  const patch = response?.available ? response : null;
  const text = patch?.patch ?? null;
  const before = useRef<DiffFile[]>([]);
  const files = useMemo(() => {
    if (text === null) return [];

    const parsed = parsePatch(text);
    const next = parsed.map(
      (file) => before.current.find((known) => sameFile(known, file)) ?? file,
    );
    before.current = next;
    return next;
  }, [text]);

  const additions = useMemo(() => files.reduce((sum, file) => sum + file.additions, 0), [files]);
  const deletions = useMemo(() => files.reduce((sum, file) => sum + file.deletions, 0), [files]);

  const reload = useCallback(() => setReads((count) => count + 1), []);

  return {
    loaded: shown !== null,
    problem,
    refreshing: live === null && cached !== null,
    available: response ? response.available : null,
    truncated: patch?.truncated ?? false,
    files,
    additions,
    deletions,
    reload,
  };
}
