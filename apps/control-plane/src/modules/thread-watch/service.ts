import { db } from "@aven/db/client";
import { botThreads } from "@aven/db/schema/bot-threads";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";

/** How many times a bot may continue or stop a thread after a note, until the person's word reaches it. */
export const BOT_THREAD_FOLLOW_UPS = 3;

/** Who is owed a note about a thread's run: the bot that sent it and its person. */
export type Watcher = { botId: string; userId: string };

/** The run a watch is for, by when it started (`Date.now()`), or null when it had ended before it was watched. */
export type WatchedRun = number | null;

const at = (run: WatchedRun) => (run === null ? null : new Date(run));

// The run a row is for: a note is owed for that run only, so the end of an earlier one, heard late,
// never takes it.
const forRun = (run: WatchedRun) =>
  run === null ? isNull(botThreads.runStartedAt) : eq(botThreads.runStartedAt, new Date(run));

const owedFor = (threadId: string) =>
  and(eq(botThreads.threadId, threadId), isNull(botThreads.notifiedAt));

const ofBot = (threadId: string, botId: string) =>
  and(eq(botThreads.threadId, threadId), eq(botThreads.botId, botId));

// The threads bots sent runs to, and whether each bot has heard how its run ended (decision 0101).
export const threadWatchService = {
  /**
   * The bot sent the thread `run`: it is owed a note when that run ends. The person's word starts
   * the count of follow-ups again; a follow-up keeps it.
   */
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

  /**
   * Counts a follow-up of the bot's on a thread it sent a run to, after a note (decision 0101), and
   * says why not when it may not: the thread is not one it watches, or it has used its follow-ups.
   */
  async followUp(threadId: string, botId: string): Promise<"ok" | "unwatched" | "spent"> {
    const [counted] = await db
      .update(botThreads)
      .set({ followUps: sql`${botThreads.followUps} + 1` })
      .where(and(ofBot(threadId, botId), lt(botThreads.followUps, BOT_THREAD_FOLLOW_UPS)))
      .returning({ threadId: botThreads.threadId });
    if (counted) return "ok";
    const [row] = await db
      .select({ botId: botThreads.botId })
      .from(botThreads)
      .where(ofBot(threadId, botId));
    return row ? "spent" : "unwatched";
  },

  /** Gives a follow-up back, for one that was counted and then could not be made. */
  async giveBack(threadId: string, botId: string) {
    await db
      .update(botThreads)
      .set({ followUps: sql`${botThreads.followUps} - 1` })
      .where(and(ofBot(threadId, botId), gt(botThreads.followUps, 0)));
  },

  /** The bot needs no note any more, as when it stopped or archived the thread itself; another bot's is kept. */
  async settle(threadId: string, botId: string) {
    await db
      .update(botThreads)
      .set({ notifiedAt: new Date() })
      .where(and(owedFor(threadId), eq(botThreads.botId, botId)));
  },

  /** Takes the note owed for the thread's `run`, once: whoever claims it sends it. */
  async claim(threadId: string, run: WatchedRun): Promise<Watcher | undefined> {
    const [claimed] = await db
      .update(botThreads)
      .set({ notifiedAt: new Date() })
      .where(and(owedFor(threadId), forRun(run)))
      .returning({ botId: botThreads.botId, userId: botThreads.userId });
    return claimed;
  },

  /** The threads whose bot is still owed a note, with the run it is owed for. */
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
