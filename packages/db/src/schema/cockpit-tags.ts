import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

// A tag the person defined in their cockpit (decision 0107): added before anything carries it, or
// given a color. Records carry tags by name, so a tag in use needs no row here.
export const cockpitTags = pgTable(
  "cockpit_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** `#rrggbb`, or null for the color the name picks. */
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("cockpit_tags_name_unique").on(table.userId, table.name)],
);

export type CockpitTagRow = typeof cockpitTags.$inferSelect;
