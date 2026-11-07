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
    objective: text("objective").notNull(),
    checks: jsonb("checks").$type<string[]>().notNull(),
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
