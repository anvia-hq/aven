import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { runtimes } from "./runtimes";
import { users } from "./users";

// A project is a name and the runner its threads' sandboxes run on. Threads always belong to one.
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The runner that hosts the project's sandboxes. Null only on projects from before sandboxes (decision 0010); they cannot run. */
    runtimeId: uuid("runtime_id").references(() => runtimes.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("projects_organization_updated_idx").on(table.organizationId, table.updatedAt),
    index("projects_runtime_idx").on(table.runtimeId),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
