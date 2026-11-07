import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { bots } from "./bots";
import { projects } from "./projects";
import { threads } from "./threads";
import { users } from "./users";

export const memoryEvents = pgTable(
  "memory_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope", { enum: ["personal", "project", "bot"] }).notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    botId: uuid("bot_id").references(() => bots.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    action: text("action", { enum: ["created", "updated", "removed", "renamed"] }).notNull(),
    from: text("from"),
    source: text("source", { enum: ["person", "thread", "bot"] }).notNull(),
    threadId: uuid("thread_id").references(() => threads.id, { onDelete: "set null" }),
    byBotId: uuid("by_bot_id").references(() => bots.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("memory_events_user_idx").on(table.userId, table.createdAt)],
);
