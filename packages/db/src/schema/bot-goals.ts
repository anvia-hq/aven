import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { bots } from "./bots";
import { users } from "./users";

// A long task a bot works on in rounds, with no one watching (decision 0068): after each reply the
// control plane wakes the bot again with a note, until it says it is done, it is blocked, or the
// rounds run out. A bot has one goal; starting another replaces a finished one.
export const botGoals = pgTable(
  "bot_goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    /** The outcome, with all a later round needs: each round starts from the bot's notes and files. */
    objective: text("objective").notNull(),
    /** Shell commands the bot's computer runs when it says it is done; they must all pass. */
    checks: jsonb("checks").$type<string[]>().notNull(),
    /** `active`, `paused`, `blocked`, `complete` or `cleared`. */
    phase: text("phase").notNull(),
    blockedReason: text("blocked_reason"),
    roundsStarted: integer("rounds_started").notNull().default(0),
    maxRounds: integer("max_rounds").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("bot_goals_bot_idx").on(table.botId),
    index("bot_goals_phase_idx").on(table.phase),
  ],
);

export type BotGoalRow = typeof botGoals.$inferSelect;
