import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { threads } from "./threads";

export const threadPullRequests = pgTable(
  "thread_pull_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    url: text("url").notNull(),
    branch: text("branch").notNull(),
    title: text("title").notNull(),
    state: text("state", { enum: ["open", "closed", "merged"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("thread_pull_requests_thread_number_unique").on(table.threadId, table.number),
    index("thread_pull_requests_thread_idx").on(table.threadId),
  ],
);
