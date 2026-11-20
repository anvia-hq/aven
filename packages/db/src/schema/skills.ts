import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { bytea } from "./columns";
import { users } from "./users";

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    archive: bytea("archive").notNull(),
    digest: text("digest").notNull(),
    size: integer("size").notNull(),
    fileCount: integer("file_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("skills_user_name_idx").on(table.userId, table.name),
    index("skills_digest_idx").on(table.digest),
  ],
);
