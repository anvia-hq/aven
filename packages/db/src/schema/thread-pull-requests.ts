import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { threads } from "./threads";

// The pull requests of a thread (decision 0069): one for each branch its agent shipped, found on
// GitHub after a run. A thread's first is on its own branch `aven/<id prefix>`, the rest on
// branches that start with the same prefix.
export const threadPullRequests = pgTable(
  "thread_pull_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    /** The number in the project's repository. */
    number: integer("number").notNull(),
    url: text("url").notNull(),
    /** The head branch. */
    branch: text("branch").notNull(),
    title: text("title").notNull(),
    /** As of the last time Aven looked, which is after a run: GitHub does not tell Aven of a merge. */
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
