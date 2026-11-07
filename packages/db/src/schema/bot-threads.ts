import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { bots } from "./bots";
import { threads } from "./threads";
import { users } from "./users";

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
    runStartedAt: timestamp("run_started_at", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
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
