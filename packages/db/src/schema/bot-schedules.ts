import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { bots } from "./bots";
import { users } from "./users";

// A task a bot does again and again, like cron (decision 0067): at each time the control plane wakes
// the bot with the task as a note. Tied to the person, and to the bot that runs it.
export const botSchedules = pgTable(
  "bot_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Five fields, or a nickname such as `@daily`. */
    cron: text("cron").notNull(),
    /** An IANA name: the cron's times are on this wall clock. */
    timezone: text("timezone").notNull(),
    /** The whole task, written to the bot, who does it later with no one to ask. */
    prompt: text("prompt").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** When it is next due; none while it is paused. */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    /** How the last time it was due went: `started`, `late`, `busy`, `missed` or `failed`. */
    lastStatus: text("last_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("bot_schedules_user_idx").on(table.userId),
    index("bot_schedules_due_idx").on(table.enabled, table.nextRunAt),
  ],
);

export type BotScheduleRow = typeof botSchedules.$inferSelect;
