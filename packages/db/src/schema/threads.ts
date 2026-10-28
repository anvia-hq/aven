import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { projects } from "./projects";
import { users } from "./users";

// A thread is one agent session, and always belongs to a project. Its conversation lives in the
// agent memory tables, keyed by this id. `project_path` is a snapshot of the project's directory
// (on the machine running control-plane) taken when the thread was created, so the agent's root
// and the thread's displayed path never change even if the project is edited later.
export const threads = pgTable(
  "threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    projectPath: text("project_path").notNull(),
    state: text("state", { enum: ["open", "snoozed", "archived"] })
      .notNull()
      .default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("threads_organization_updated_idx").on(table.organizationId, table.updatedAt),
    index("threads_project_idx").on(table.projectId),
  ],
);

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
