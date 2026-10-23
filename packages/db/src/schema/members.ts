import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { users } from "./users";

// Better Auth organization plugin table. A user can belong to an organization once.
export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique().on(table.organizationId, table.userId)],
);

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
