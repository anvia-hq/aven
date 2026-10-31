import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { projects } from "./projects";

// An environment variable of a project, given to the agent's commands in a thread's sandbox
// (decision 0045). The value is stored encrypted (AES-256-GCM); a secret is never shown again.
export const projectVariables = pgTable(
  "project_variables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** `iv.tag.ciphertext`, base64 parts. */
    valueEncrypted: text("value_encrypted").notNull(),
    /** Last characters of a secret's value, safe to display; null for a plain variable. */
    valueHint: text("value_hint"),
    secret: boolean("secret").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("project_variables_project_idx").on(table.projectId),
    uniqueIndex("project_variables_project_name_idx").on(table.projectId, table.name),
  ],
);

export type ProjectVariableRow = typeof projectVariables.$inferSelect;
export type NewProjectVariableRow = typeof projectVariables.$inferInsert;
