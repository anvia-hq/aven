import { describeError } from "@aven/server-kit/errors";

import type { ThreadEventNotes } from "./event-notes";
import type { PullWatchSource, WatchedPull } from "./types";

export const PULL_WATCH_INTERVAL_MS = 10 * 60_000;
export const PULL_WATCH_MAX = 30;

export function createPullRequestWatch(options: {
  source: PullWatchSource;
  notes: Pick<ThreadEventNotes, "offer">;
  intervalMs?: number;
}) {
  const { source, notes, intervalMs = PULL_WATCH_INTERVAL_MS } = options;
  let timer: ReturnType<typeof setInterval> | undefined;
  let ticking: Promise<void> | undefined;

  async function check(pull: WatchedPull) {
    const detail = await source.inspect(pull);

    if (!detail) return;

    const thread = { id: pull.threadId, title: pull.threadTitle, repository: pull.repository };
    const named = { number: pull.number, url: pull.url, title: detail.title };

    if (detail.status === "merged") {
      const told = await notes.offer(pull.userId, { kind: "merged", thread, pull: named });

      if (told !== "limited") await source.saveEnded(pull, "merged");

      return;
    }

    if (detail.status === "closed") return source.saveEnded(pull, "closed");

    if (detail.checks.state === "failure") {
      const failing = detail.checks.runs.flatMap((run) =>
        run.state === "failure" ? [run.name] : [],
      );
      await notes.offer(pull.userId, { kind: "ci_failing", thread, pull: named, failing });
    }
  }

  async function tick() {
    for (const pull of await source.openPulls(PULL_WATCH_MAX)) {
      await check(pull).catch((error: unknown) =>
        console.warn(
          `Could not check pull request #${pull.number} of thread ${pull.threadId}:`,
          describeError(error),
        ),
      );
    }
  }

  const guarded = () => {
    ticking ??= tick()
      .catch((error: unknown) =>
        console.warn("A pull request watch tick failed:", describeError(error)),
      )
      .finally(() => (ticking = undefined));
    return ticking;
  };

  return {
    tick,
    start() {
      if (timer) return;

      timer = setInterval(() => void guarded(), intervalMs);
      timer.unref();
    },
    async close() {
      clearInterval(timer);
      timer = undefined;
      await ticking;
    },
  };
}
