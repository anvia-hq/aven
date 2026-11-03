import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { bots } from "./bots";
import { projects } from "./projects";
import { threads } from "./threads";
import { users } from "./users";

// What happened to a note, kept so the person can see who changed their memory (decision 0102):
// the note's scope and name, never its body.
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
    /** The name it had, for a note renamed. */
    from: text("from"),
    /** The person in Settings, a thread's agent or a bot. */
    source: text("source", { enum: ["person", "thread", "bot"] }).notNull(),
    /** The thread whose agent made the change; empty once the thread is gone. */
    threadId: uuid("thread_id").references(() => threads.id, { onDelete: "set null" }),
    /** The bot that made the change; empty once the bot is gone. */
    byBotId: uuid("by_bot_id").references(() => bots.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("memory_events_user_idx").on(table.userId, table.createdAt)],
);

export type MemoryEventRow = typeof memoryEvents.$inferSelect;
