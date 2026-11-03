import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { bots } from "./bots";
import { threads } from "./threads";
import { users } from "./users";

// A thread a bot sent a run to, watched so the bot hears how that run ended (decision 0101). One
// row a thread: the bot that sent its latest run and which run that is, with a note owed while
// `notified_at` is null.
export const botThreads = pgTable(
  "bot_threads",
  {
    threadId: uuid("thread_id")
      .primaryKey()
      .references(() => threads.id, { onDelete: "cascade" }),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * When the watched run started, as the control plane's run manager knows it: only that run's end
     * is told. Null when the run had ended before it was watched.
     */
    runStartedAt: timestamp("run_started_at", { withTimezone: true }),
    /** When the bot was told how the run ended, or the watch was settled with no note; null while one is owed. */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    /** Continues and stops the bot made after a note, since the person's own word last reached the thread. */
    followUps: integer("follow_ups").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("bot_threads_bot_idx").on(table.botId),
    index("bot_threads_owed_idx")
      .on(table.threadId)
      .where(sql`${table.notifiedAt} IS NULL`),
  ],
);

export type BotThreadRow = typeof botThreads.$inferSelect;
