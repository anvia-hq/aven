import { db } from "@aven/db/client";
import { botThreads } from "@aven/db/schema/bot-threads";
import { and, eq, isNull } from "drizzle-orm";

/** Who is owed a note about a thread's run: the bot that sent it and its person. */
export type Watcher = { botId: string; userId: string };

// The threads bots sent runs to, and whether each bot has heard how its run ended (decision 0101).
export const threadWatchService = {
  /** The bot sent the thread a run: it is owed a note when that run ends. */
  async watch(threadId: string, { botId, userId }: Watcher) {
    await db
      .insert(botThreads)
      .values({ threadId, botId, userId })
      .onConflictDoUpdate({
        target: botThreads.threadId,
        set: { botId, userId, notifiedAt: null, updatedAt: new Date() },
      });
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
