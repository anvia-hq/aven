import { db } from "@aven/db/client";
import { threads } from "@aven/db/schema/threads";
import { THREAD_ARCHIVE_AFTER_DAYS } from "@aven/protocol/threads";
import { describeError } from "@aven/server-kit/errors";
import { and, asc, eq, isNull, lt } from "drizzle-orm";

import type { ThreadRetentionOptions } from "./types";

const DAY_MS = 86_400_000;
const SWEPT_AT_MOST = 200;

export function createThreadRetention({
  archive,
  isRunning,
  intervalMs,
  afterMs = THREAD_ARCHIVE_AFTER_DAYS * DAY_MS,
  limit = SWEPT_AT_MOST,
}: ThreadRetentionOptions) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let ticking: Promise<unknown> | undefined;

  async function sweep(now = new Date()) {
    const stale = await db
      .select({
        id: threads.id,
        organizationId: threads.organizationId,
        createdBy: threads.createdBy,
        runtimeId: threads.runtimeId,
      })
      .from(threads)
      .where(
        and(
          eq(threads.state, "open"),
          isNull(threads.pendingContinuation),
          lt(threads.updatedAt, new Date(now.getTime() - afterMs)),
        ),
      )
      .orderBy(asc(threads.updatedAt))
      .limit(limit);
    let archived = 0;
    for (const thread of stale) {
      if (isRunning(thread.id)) continue;

      try {
        await archive(thread);
        archived += 1;
      } catch (error) {
        console.warn(`Could not archive the stale thread ${thread.id}:`, describeError(error));
      }
    }
    return archived;
  }

  const guarded = () => {
    if (ticking) return;

    ticking = sweep()
      .catch((error: unknown) =>
        console.warn("A sweep for stale threads failed:", describeError(error)),
      )
      .finally(() => {
        ticking = undefined;
      });
  };

  return {
    sweep,
    start() {
      if (timer) return;

      guarded();
      timer = setInterval(guarded, intervalMs);
      timer.unref();
    },
    async close() {
      clearInterval(timer);
      timer = undefined;
      await ticking;
    },
  };
}
