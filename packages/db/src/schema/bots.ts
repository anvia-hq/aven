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
    /** A line on what the bot is for, shown under its name; empty until it or the person writes one. */
    description: text("description").notNull().default(""),
    /** A short string, an emoji; empty until the person picks one. */
    avatar: text("avatar").notNull().default(""),
    /**
     * The model the bot talks with: one of the person's providers and one of its models. Without a
     * provider the bot uses the person's default; without a model, the provider's own. A provider
     * that is removed leaves the bot on the default.
     */
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "set null" }),
    modelId: text("model_id"),
    /** One of the model's reasoning levels; only a bot with a model of its own has one. */
    reasoningEffort: text("reasoning_effort"),
    /** The size of the chat, in tokens, past which old turns are summarized; null is the model's 70%. */
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
    // At most one main bot per user.
    uniqueIndex("bots_user_main_idx")
      .on(table.userId)
      .where(sql`${table.isMain}`),
  ],
);

export type BotRow = typeof bots.$inferSelect;
