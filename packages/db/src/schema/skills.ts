import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
  // The driver hands back a Buffer; a plain Uint8Array keeps callers off Node's types.
  fromDriver: (value) => new Uint8Array(value),
});

// A skill a user uploaded (decision 0035). Tied to the user, like providers: it goes with them
// into every organization. The folder is kept as a `.tar.gz`, named by a SHA-256 of its files.
export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The skill's own name, from its SKILL.md; also the folder it is in. */
    name: text("name").notNull(),
    description: text("description").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    archive: bytea("archive").notNull(),
    /** SHA-256 of the files and their paths, in hex: the same folder uploaded twice has the same one. */
    digest: text("digest").notNull(),
    /** The unpacked size and file count, for display. */
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

export type SkillRow = typeof skills.$inferSelect;
