import { useAtomValue, useStore } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import { diffCacheKey, threadDiffCacheAtom } from "../atoms/thread-diff-atom";
import { parsePatch } from "../parse-patch";
import { sameFile } from "../same-file";
import type { DiffFile, ThreadDiff, ThreadDiffResponse, ThreadDiffScope } from "../types";

const POLL_MS = 4_000;

type ActiveRequest = {
  controller: AbortController;
  promise: Promise<void>;
  waiters: number;
};

const inFlight = new Map<string, ActiveRequest>();
const activeFull = new Map<string, number>();

function deriveSummary(data: Extract<ThreadDiffResponse, { available: true }>) {
  if (data.summary) return data.summary;

  const files = parsePatch(data.patch);
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    additions += file.additions;
    deletions += file.deletions;
  }
  return { files: files.length, additions, deletions };
}

export function useThreadDiff(
  threadId: string,
  scope: ThreadDiffScope,
  running: boolean,
  enabled = true,
  options?: { summaryOnly?: boolean },
): ThreadDiff {
  const summaryOnly = options?.summaryOnly === true;
  const store = useStore();
  const cache = useAtomValue(threadDiffCacheAtom);
  const key = diffCacheKey(threadId, scope, summaryOnly);
  const fullKey = diffCacheKey(threadId, scope, false);
  const summaryKey = diffCacheKey(threadId, scope, true);
  const fullScopeKey = `${threadId}:${scope}`;
  const [fetching, setFetching] = useState(false);

  const runFetch = useCallback(
    (force = false) => {
      if (!force && summaryOnly && (activeFull.get(fullScopeKey) ?? 0) > 0) {
        return Promise.resolve();
      }

      const existing = inFlight.get(key);

      if (existing) {
        existing.waiters++;
        return existing.promise.finally(() => {
          existing.waiters--;
        });
      }

      const controller = new AbortController();
      const query = summaryOnly ? `scope=${scope}&summary=1` : `scope=${scope}`;
      const path = `/threads/${threadId}/diff?${query}`;
      const promise = api<ThreadDiffResponse>(path, { signal: controller.signal })
        .then((data) => {
          if (controller.signal.aborted) return;

          const current = store.get(threadDiffCacheAtom);

          if (!summaryOnly && data.available) {
            const summary = deriveSummary(data);
            store.set(threadDiffCacheAtom, {
              ...current,
              [fullKey]: { loaded: { ...data, summary } },
              [summaryKey]: {
                loaded: {
                  available: true,
                  patch: "",
                  truncated: data.truncated,
                  branch: data.branch,
                  summary,
                },
              },
            });
            return;
          }

          if (!summaryOnly && !data.available) {
            store.set(threadDiffCacheAtom, {
              ...current,
              [fullKey]: { loaded: data },
              [summaryKey]: { loaded: data },
            });
            return;
          }

          store.set(threadDiffCacheAtom, { ...current, [key]: { loaded: data } });
        })
        .catch((failure: unknown) => {
          if (controller.signal.aborted) return;

          const current = store.get(threadDiffCacheAtom);
          store.set(threadDiffCacheAtom, {
            ...current,
            [key]: { loaded: errorMessage(failure) },
          });
        })
        .finally(() => {
          if (inFlight.get(key)?.controller === controller) inFlight.delete(key);
        });

      const record: ActiveRequest = { controller, promise, waiters: 1 };
      inFlight.set(key, record);
      return promise.finally(() => {
        record.waiters--;
      });
    },
    [fullKey, fullScopeKey, key, scope, store, summaryKey, summaryOnly, threadId],
  );

  useEffect(() => {
    if (!enabled || summaryOnly) return;

    activeFull.set(fullScopeKey, (activeFull.get(fullScopeKey) ?? 0) + 1);
    return () => {
      const next = (activeFull.get(fullScopeKey) ?? 1) - 1;

      if (next <= 0) activeFull.delete(fullScopeKey);
      else activeFull.set(fullScopeKey, next);
    };
  }, [enabled, fullScopeKey, summaryOnly]);

  useEffect(() => {
    if (!enabled) return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      setFetching(true);
      await runFetch();

      if (!alive) return;

      setFetching(false);

      if (running) timer = setTimeout(() => void tick(), POLL_MS);
    };

    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
      const pending = inFlight.get(key);

      if (pending && pending.waiters <= 1) {
        inFlight.delete(key);
        pending.controller.abort();
      }
    };
  }, [enabled, key, runFetch, running]);

  const refresh = useCallback(() => {
    if (!enabled) return;

    setFetching(true);
    void runFetch(true).finally(() => setFetching(false));
  }, [enabled, runFetch]);

  const entry = enabled ? (cache[key] ?? (summaryOnly ? cache[fullKey] : undefined)) : undefined;
  const shown = entry?.loaded ?? null;
  const problem = typeof shown === "string" ? shown : null;
  const response = shown !== null && typeof shown === "object" ? shown : null;
  const patch = response?.available ? response : null;
  const text = !summaryOnly && patch ? patch.patch : null;
  const before = useRef(new Map<string, DiffFile>());
  const files = useMemo(() => {
    if (text === null) return [];

    const parsed = parsePatch(text);
    const nextMap = new Map<string, DiffFile>();
    const next = parsed.map((file) => {
      const known = before.current.get(file.path);
      const kept = known && sameFile(known, file) ? known : file;
      nextMap.set(kept.path, kept);
      return kept;
    });
    before.current = nextMap;
    return next;
  }, [text]);

  const counts = useMemo(() => {
    if (patch?.summary) return patch.summary;

    if (summaryOnly && patch) return deriveSummary(patch);

    let additions = 0;
    let deletions = 0;
    for (const file of files) {
      additions += file.additions;
      deletions += file.deletions;
    }
    return { files: files.length, additions, deletions };
  }, [files, patch, summaryOnly]);

  return {
    loaded: shown !== null,
    problem,
    refreshing: fetching && shown !== null,
    available: response ? response.available : null,
    truncated: patch?.truncated ?? false,
    branch: patch?.branch ?? null,
    files,
    fileCount: counts.files,
    additions: counts.additions,
    deletions: counts.deletions,
    refresh,
  };
}
