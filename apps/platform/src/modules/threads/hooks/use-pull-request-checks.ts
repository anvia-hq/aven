import { useEffect, useState } from "react";

import { api } from "@/lib/api";

import type { ThreadPullRequest, ThreadPullRequestCheck } from "../types";

const POLL_PENDING_MS = 30_000;
const MAX_POLLS = 20;
const MAX_EMPTY_POLLS = 3;

export function usePullRequestChecks(
  threadId: string,
  pullRequests: readonly ThreadPullRequest[],
  running: boolean,
) {
  const [checks, setChecks] = useState<ThreadPullRequestCheck[]>([]);
  const openCount = pullRequests.filter((pull) => pull.state === "open").length;
  const key = pullRequests.map((pull) => `${pull.number}:${pull.state}`).join(",");

  useEffect(() => {
    if (openCount === 0) {
      setChecks([]);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    let emptyPolls = 0;

    const schedule = () => {
      if (cancelled || polls >= MAX_POLLS || document.hidden) return;

      timer = setTimeout(() => void load(), POLL_PENDING_MS);
    };

    const load = async () => {
      if (cancelled) return;

      polls += 1;
      try {
        const result = await api<ThreadPullRequestCheck[]>(
          `/threads/${threadId}/pull-requests/checks`,
        );

        if (cancelled) return;

        setChecks(result);
        const pending = result.some((item) => item.checksState === "pending");
        const waitingForFirst =
          result.some((item) => item.state === "open" && item.checksState === "none") &&
          emptyPolls < MAX_EMPTY_POLLS;

        if (waitingForFirst && !pending) emptyPolls += 1;

        if (pending || waitingForFirst) schedule();
      } catch {
        if (!cancelled && polls < MAX_POLLS) schedule();
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }

        return;
      }

      if (!timer && polls < MAX_POLLS) void load();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void load();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);

      if (timer) clearTimeout(timer);
    };
  }, [threadId, openCount, key, running]);

  return checks;
}
