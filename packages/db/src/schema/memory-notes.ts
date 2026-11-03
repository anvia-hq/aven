import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { bots } from "./bots";
import { projects } from "./projects";
import { users } from "./users";

// A note an agent keeps of what it learnt (decision 0102): the person's own, in one scope. A
// `personal` note has neither `projectId` nor `botId`, a `project` note the project and a `bot`
// note the bot; it goes with either.
export const memoryNotes = pgTable(
  "memory_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope", { enum: ["personal", "project", "bot"] }).notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    botId: uuid("bot_id").references(() => bots.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One note of a name in a scope; a missing project or bot counts as the same.
    unique("memory_notes_name_unique")
      .on(table.userId, table.scope, table.projectId, table.botId, table.name)
      .nullsNotDistinct(),
    index("memory_notes_project_idx").on(table.projectId),
    index("memory_notes_bot_idx").on(table.botId),
  ],
);

export type MemoryNoteRow = typeof memoryNotes.$inferSelect;
