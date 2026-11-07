import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { projects } from "./projects";
import { users } from "./users";

export const environmentVariables = pgTable(
  "environment_variables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    valueEncrypted: text("value_encrypted").notNull(),
    valueHint: text("value_hint"),
    secret: boolean("secret").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("environment_variables_organization_idx").on(table.organizationId),
    uniqueIndex("environment_variables_workspace_name_idx")
      .on(table.organizationId, table.name)
      .where(sql`${table.projectId} is null and ${table.userId} is null`),
    uniqueIndex("environment_variables_project_name_idx")
      .on(table.projectId, table.name)
      .where(sql`${table.projectId} is not null`),
    uniqueIndex("environment_variables_personal_name_idx")
      .on(table.organizationId, table.userId, table.name)
      .where(sql`${table.userId} is not null`),
    check(
      "environment_variables_one_scope",
      sql`not (${table.projectId} is not null and ${table.userId} is not null)`,
    ),
  ],
);
