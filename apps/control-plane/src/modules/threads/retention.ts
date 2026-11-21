import { db } from "@aven/db/client";
import { threadPins } from "@aven/db/schema/thread-pins";
import { threads } from "@aven/db/schema/threads";
import { THREAD_ARCHIVE_AFTER_DAYS } from "@aven/protocol/threads";
import { describeError } from "@aven/server-kit/errors";
import { createPoller } from "@aven/server-kit/poller";
import { and, asc, eq, isNull, lt, notExists } from "drizzle-orm";

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
          notExists(
            db
              .select({ threadId: threadPins.threadId })
              .from(threadPins)
              .where(eq(threadPins.threadId, threads.id)),
          ),
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

  const poller = createPoller({
    intervalMs,
    run: async () => {
      await sweep();
    },
    onError: (error) => console.warn("A sweep for stale threads failed:", describeError(error)),
  });

  return { sweep, start: poller.start, close: poller.close };
}
