import { db } from "@aven/db/client";
import { botThreads } from "@aven/db/schema/bot-threads";
import { and, eq, isNull, lt, sql } from "drizzle-orm";

/** How many times a bot may continue or stop a thread after a note, until the person's word reaches it. */
export const BOT_THREAD_FOLLOW_UPS = 3;

/** Who is owed a note about a thread's run: the bot that sent it and its person. */
export type Watcher = { botId: string; userId: string };

// The threads bots sent runs to, and whether each bot has heard how its run ended (decision 0101).
export const threadWatchService = {
  /**
   * The bot sent the thread a run: it is owed a note when that run ends. The person's word starts
   * the count of follow-ups again; a follow-up keeps it.
   */
  async watch(threadId: string, { botId, userId }: Watcher, personsWord = true) {
    await db
      .insert(botThreads)
      .values({ threadId, botId, userId })
      .onConflictDoUpdate({
        target: botThreads.threadId,
        set: {
          botId,
          userId,
          notifiedAt: null,
          followUps: personsWord ? 0 : sql`${botThreads.followUps}`,
          updatedAt: new Date(),
        },
      });
  },

  /**
   * Counts a follow-up of the bot's on a thread it sent a run to, after a note (decision 0101), and
   * says why not when it may not: the thread is not one it watches, or it has used its follow-ups.
   */
  async followUp(threadId: string, botId: string): Promise<"ok" | "unwatched" | "spent"> {
    const [counted] = await db
      .update(botThreads)
      .set({ followUps: sql`${botThreads.followUps} + 1` })
      .where(
        and(
          eq(botThreads.threadId, threadId),
          eq(botThreads.botId, botId),
          lt(botThreads.followUps, BOT_THREAD_FOLLOW_UPS),
        ),
      )
      .returning({ threadId: botThreads.threadId });
    if (counted) return "ok";
    const [row] = await db
      .select({ botId: botThreads.botId })
      .from(botThreads)
      .where(and(eq(botThreads.threadId, threadId), eq(botThreads.botId, botId)));
    return row ? "spent" : "unwatched";
  },

  /** No note is owed any more, as when the bot stopped or archived the thread itself. */
  async settle(threadId: string) {
    await db
      .update(botThreads)
      .set({ notifiedAt: new Date() })
      .where(and(eq(botThreads.threadId, threadId), isNull(botThreads.notifiedAt)));
  },

  /** Takes the note owed for the thread, once: whoever claims it sends it. */
  async claim(threadId: string): Promise<Watcher | undefined> {
    const [claimed] = await db
      .update(botThreads)
      .set({ notifiedAt: new Date() })
      .where(and(eq(botThreads.threadId, threadId), isNull(botThreads.notifiedAt)))
      .returning({ botId: botThreads.botId, userId: botThreads.userId });
    return claimed;
  },

  /** The threads whose bot is still owed a note. */
  async owed() {
    return db
      .select({ threadId: botThreads.threadId, botId: botThreads.botId, userId: botThreads.userId })
      .from(botThreads)
      .where(isNull(botThreads.notifiedAt));
  },
};
