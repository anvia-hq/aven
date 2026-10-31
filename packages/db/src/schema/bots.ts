import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./users";

// A bot a person talks to (decision 0058). Tied to the user, like providers and skills: it follows
// them into every organization. Its conversation lives in the agent memory tables, keyed by this id.
export const bots = pgTable(
  "bots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** What the person told the bot to be like. */
    instruction: text("instruction").notNull(),
    /** A short string, an emoji; empty until the person picks one. */
    avatar: text("avatar").notNull().default(""),
    isMain: boolean("is_main").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("bots_user_idx").on(table.userId),
    // At most one main bot per user.
    uniqueIndex("bots_user_main_idx")
      .on(table.userId)
      .where(sql`${table.isMain}`),
  ],
);

export type BotRow = typeof bots.$inferSelect;
