import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/api";

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
  const answers = useRef(new Map<string, KeptAnswer>());
  const recent = useRef<KeptAnswer | null>(null);

  useEffect(() => {
    setAnswer(null);
    answers.current.clear();
    recent.current = null;
  }, [threadId]);

  useEffect(() => {
    if (!enabled) return;

    let current = true;
    const path = `/threads/${threadId}/diff?scope=${scope}`;
    const look = async () => {
      try {
        const data = await api<ThreadDiffResponse>(path);

        if (current) {
          const next: KeptAnswer = { threadId, scope, loaded: data };
          answers.current.set(scope, next);
          recent.current = next;
          setAnswer(next);
        }
      } catch {
        if (current) {
          const next: KeptAnswer = { threadId, scope, loaded: "The changes could not be read" };
          answers.current.set(scope, next);
          setAnswer(next);
        }
      }
    };
    void look();
    const timer = running ? setInterval(() => void look(), POLL_MS) : undefined;
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [threadId, scope, reads, running, enabled]);

  const live = enabled && answer !== null && answer.threadId === threadId ? answer : null;
  const current = live !== null && live.scope === scope ? live.loaded : null;
  const sameScope = live === null ? null : (answers.current.get(scope) ?? null);
  const sameKept = sameScope !== null && typeof sameScope.loaded === "object" ? sameScope : null;
  const fresh = recent.current;
  const fallback =
    live === null ||
    fresh === null ||
    fresh.threadId !== threadId ||
    typeof fresh.loaded !== "object"
      ? null
      : fresh;
  const shown = current ?? sameKept?.loaded ?? fallback?.loaded ?? null;
  const shownScope = current !== null ? scope : (sameKept?.scope ?? fallback?.scope ?? scope);
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
    scope: shownScope,
    available: response ? response.available : null,
    truncated: patch?.truncated ?? false,
    files,
    additions,
    deletions,
    reload,
  };
}
