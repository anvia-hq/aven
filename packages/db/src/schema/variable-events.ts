import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { projects } from "./projects";
import { users } from "./users";

// What happened to an environment variable, kept so a change can be traced (decision 0048). It has
// the scope columns of the variable (`projectId`, `userId`, neither for the workspace) and never a
// value: not a secret's, not a plain one's, not a hint of one.
export const variableEvents = pgTable(
  "variable_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    /** Whose own variable it was, for a personal one. */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** Who did it; empty once their account is gone. */
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    action: text("action", { enum: ["created", "updated", "removed"] }).notNull(),
    /** Whether the variable was a secret when this happened. */
    secret: boolean("secret").notNull(),
    /** The settings, or the agent's request for a secret (decision 0047). */
    source: text("source", { enum: ["settings", "agent"] })
      .notNull()
      .default("settings"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("variable_events_organization_idx").on(table.organizationId, table.createdAt),
    index("variable_events_project_idx").on(table.projectId, table.createdAt),
    index("variable_events_user_idx").on(table.userId, table.createdAt),
  ],
);

export type VariableEventRow = typeof variableEvents.$inferSelect;
export type NewVariableEventRow = typeof variableEvents.$inferInsert;
