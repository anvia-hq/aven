import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";
import { threads } from "./threads";

export const threadMentions = pgTable(
  "thread_mentions",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    excerpt: text("excerpt").notNull().default(""),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.userId] })],
);
