import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

// A note the person keeps in their cockpit (decision 0104), in markdown.
export const cockpitNotes = pgTable(
  "cockpit_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("cockpit_notes_user_idx").on(table.userId, table.updatedAt)],
);

export type CockpitNoteRow = typeof cockpitNotes.$inferSelect;
