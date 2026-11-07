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
import { sql } from "drizzle-orm";

import { providers } from "./providers";
import { users } from "./users";

export const bots = pgTable(
  "bots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    handle: text("handle").notNull(),
    instruction: text("instruction").notNull(),
    description: text("description").notNull().default(""),
    avatar: text("avatar").notNull().default(""),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "set null" }),
    modelId: text("model_id"),
    reasoningEffort: text("reasoning_effort"),
    compactAfterTokens: integer("compact_after_tokens"),
    isMain: boolean("is_main").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("bots_user_idx").on(table.userId),
    uniqueIndex("bots_user_handle_idx").on(table.userId, table.handle),
    uniqueIndex("bots_user_main_idx")
      .on(table.userId)
      .where(sql`${table.isMain}`),
  ],
);

export type BotRow = typeof bots.$inferSelect;
