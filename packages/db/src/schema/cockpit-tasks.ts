import { sql } from "drizzle-orm";
import {
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const cockpitTasks = pgTable(
  "cockpit_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", {
      enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"],
    })
      .notNull()
      .default("todo"),
    priority: text("priority", { enum: ["urgent", "high", "medium", "low", "none"] })
      .notNull()
      .default("none"),
    dueDate: date("due_date", { mode: "string" }),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    position: doublePrecision("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("cockpit_tasks_number_unique").on(table.userId, table.number),
    index("cockpit_tasks_user_idx").on(table.userId, table.status, table.position),
  ],
);

export type CockpitTaskRow = typeof cockpitTasks.$inferSelect;
