import { integer, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { threads } from "./threads";

export const threadRunTimes = pgTable(
  "thread_run_times",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    messageIndex: integer("message_index").notNull(),
    workedMs: integer("worked_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.messageIndex] })],
);
