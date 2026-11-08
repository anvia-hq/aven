import { db } from "@aven/db/client";
import { botThreads } from "@aven/db/schema/bot-threads";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { WatchedRun, Watcher } from "./types";

export const BOT_THREAD_FOLLOW_UPS = 3;
export const BOT_THREAD_FOLLOW_UPS_CEILING = 12;

const at = (run: WatchedRun) => (run === null ? null : new Date(run));

const forRun = (run: WatchedRun) =>
  run === null ? isNull(botThreads.runStartedAt) : eq(botThreads.runStartedAt, new Date(run));

const owedFor = (threadId: string) =>
  and(eq(botThreads.threadId, threadId), isNull(botThreads.notifiedAt));

const ofBot = (threadId: string, botId: string) =>
  and(eq(botThreads.threadId, threadId), eq(botThreads.botId, botId));

export const threadWatchService = {
  async watch(
    threadId: string,
    { botId, userId }: Watcher,
    { run, personsWord }: { run: WatchedRun; personsWord: boolean },
  ) {
    await db
      .insert(botThreads)
      .values({ threadId, botId, userId, runStartedAt: at(run) })
      .onConflictDoUpdate({
        target: botThreads.threadId,
        set: {
          botId,
          userId,
          runStartedAt: at(run),
          notifiedAt: null,
          followUps: personsWord ? 0 : sql`${botThreads.followUps}`,
          updatedAt: new Date(),
        },
      });
  },

  async followUp(threadId: string, botId: string): Promise<"ok" | "unwatched" | "spent"> {
    const [counted] = await db
      .update(botThreads)
      .set({ followUps: sql`${botThreads.followUps} + 1` })
      .where(and(ofBot(threadId, botId), lt(botThreads.followUps, BOT_THREAD_FOLLOW_UPS_CEILING)))
      .returning({ followUps: botThreads.followUps });
    if (counted) {
      if (counted.followUps > BOT_THREAD_FOLLOW_UPS) {
        console.warn(
          `Bot ${botId} follows up thread ${threadId} for the ${counted.followUps}th time without the person's word, past the usual ${BOT_THREAD_FOLLOW_UPS}; allowed up to ${BOT_THREAD_FOLLOW_UPS_CEILING}.`,
        );
      }
      return "ok";
    }
    const [row] = await db
      .select({ botId: botThreads.botId })
      .from(botThreads)
      .where(ofBot(threadId, botId));
    return row ? "spent" : "unwatched";
  },

  async giveBack(threadId: string, botId: string) {
    await db
      .update(botThreads)
      .set({ followUps: sql`${botThreads.followUps} - 1` })
      .where(and(ofBot(threadId, botId), gt(botThreads.followUps, 0)));
  },

  async settle(threadId: string, botId: string) {
    await db
      .update(botThreads)
      .set({ notifiedAt: new Date() })
      .where(and(owedFor(threadId), eq(botThreads.botId, botId)));
  },

  async claim(threadId: string, run: WatchedRun): Promise<Watcher | undefined> {
    const [claimed] = await db
      .update(botThreads)
      .set({ notifiedAt: new Date() })
      .where(and(owedFor(threadId), forRun(run)))
      .returning({ botId: botThreads.botId, userId: botThreads.userId });
    return claimed;
  },

  async owed() {
    const rows = await db
      .select({
        threadId: botThreads.threadId,
        botId: botThreads.botId,
        userId: botThreads.userId,
        runStartedAt: botThreads.runStartedAt,
      })
      .from(botThreads)
      .where(isNull(botThreads.notifiedAt));
    return rows.map(({ runStartedAt, ...row }) => ({
      ...row,
      run: (runStartedAt?.getTime() ?? null) as WatchedRun,
    }));
  },
};
