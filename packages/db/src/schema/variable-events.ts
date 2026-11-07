import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { projects } from "./projects";
import { users } from "./users";

export const variableEvents = pgTable(
  "variable_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    action: text("action", { enum: ["created", "updated", "removed"] }).notNull(),
    secret: boolean("secret").notNull(),
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
