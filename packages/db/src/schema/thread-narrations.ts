import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { threads } from "./threads";

export const threadNarrations = pgTable(
  "thread_narrations",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    toolId: text("tool_id").notNull(),
    label: text("label").notNull(),
    outcome: text("outcome"),
    icon: text("icon"),
    tone: text("tone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.toolId] })],
);
