import { useAtomValue, useStore } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import { diffCacheKey, threadDiffCacheAtom } from "../atoms/thread-diff-atom";
import { parsePatch } from "../parse-patch";
import { sameFile } from "../same-file";
import type { DiffFile, ThreadDiff, ThreadDiffResponse, ThreadDiffScope } from "../types";

const FULL_POLL_MS = 6_000;
const SUMMARY_POLL_MS = 10_000;

type ActiveRequest = {
  controller: AbortController;
  promise: Promise<void>;
  waiters: number;
};

const inFlight = new Map<string, ActiveRequest>();
const activeFull = new Map<string, number>();

function sameLoaded(a: ThreadDiffResponse | string | undefined, b: ThreadDiffResponse | string) {
  if (a === b) return true;

  if (!a || typeof a === "string" || typeof b === "string") return false;

  if (a.available !== b.available) return false;

  if (!a.available || !b.available) return true;

  return (
    a.patch === b.patch &&
    a.truncated === b.truncated &&
    (a.branch ?? null) === (b.branch ?? null) &&
    a.summary?.files === b.summary?.files &&
    a.summary?.additions === b.summary?.additions &&
    a.summary?.deletions === b.summary?.deletions
  );
}

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
  const [manualRefreshing, setManualRefreshing] = useState(false);

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
            const nextFull: ThreadDiffResponse = { ...data, summary };
            const nextSummary: ThreadDiffResponse = {
              available: true,
              patch: "",
              truncated: data.truncated,
              branch: data.branch,
              summary,
            };

            if (
              sameLoaded(current[fullKey]?.loaded, nextFull) &&
              sameLoaded(current[summaryKey]?.loaded, nextSummary)
            ) {
              return;
            }

            store.set(threadDiffCacheAtom, {
              ...current,
              [fullKey]: { loaded: nextFull },
              [summaryKey]: { loaded: nextSummary },
            });
            return;
          }

          if (!summaryOnly && !data.available) {
            if (
              sameLoaded(current[fullKey]?.loaded, data) &&
              sameLoaded(current[summaryKey]?.loaded, data)
            ) {
              return;
            }

            store.set(threadDiffCacheAtom, {
              ...current,
              [fullKey]: { loaded: data },
              [summaryKey]: { loaded: data },
            });
            return;
          }

          if (sameLoaded(current[key]?.loaded, data)) return;

          store.set(threadDiffCacheAtom, { ...current, [key]: { loaded: data } });
        })
        .catch((failure: unknown) => {
          if (controller.signal.aborted) return;

          const message = errorMessage(failure);
          const current = store.get(threadDiffCacheAtom);

          if (sameLoaded(current[key]?.loaded, message)) return;

          store.set(threadDiffCacheAtom, {
            ...current,
            [key]: { loaded: message },
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

    const intervalMs = summaryOnly ? SUMMARY_POLL_MS : FULL_POLL_MS;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (!alive || !running || document.visibilityState === "hidden") return;

      clearTimeout(timer);
      timer = setTimeout(() => void tick(), intervalMs);
    };

    const tick = async () => {
      await runFetch();
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        clearTimeout(timer);
        return;
      }

      if (running) void tick();
    };

    if (document.visibilityState !== "hidden") void tick();

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      const pending = inFlight.get(key);

      if (pending && pending.waiters <= 1) {
        inFlight.delete(key);
        pending.controller.abort();
      }
    };
  }, [enabled, key, runFetch, running, summaryOnly]);

  const refresh = useCallback(() => {
    if (!enabled) return;

    setManualRefreshing(true);
    void runFetch(true).finally(() => setManualRefreshing(false));
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
    refreshing: manualRefreshing && shown !== null,
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
