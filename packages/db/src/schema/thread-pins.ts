import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { threads } from "./threads";
import { users } from "./users";

export const threadPins = pgTable(
  "thread_pins",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.userId] })],
);
