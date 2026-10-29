import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { runtimes } from "./runtimes";
import { users } from "./users";

// A project is a named, reusable working directory. Threads always belong to one.
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
    /** The runtime whose disk `projectPath` is on; null means the control plane's own machine. */
    runtimeId: uuid("runtime_id").references(() => runtimes.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    projectPath: text("project_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("projects_organization_updated_idx").on(table.organizationId, table.updatedAt),
    // The same path on two machines is two projects.
    uniqueIndex("projects_local_path_idx")
      .on(table.organizationId, table.projectPath)
      .where(sql`${table.runtimeId} is null`),
    uniqueIndex("projects_runtime_path_idx")
      .on(table.organizationId, table.runtimeId, table.projectPath)
      .where(sql`${table.runtimeId} is not null`),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
