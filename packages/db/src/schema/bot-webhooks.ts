import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

export const botWebhooks = pgTable(
  "bot_webhooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    tokenHint: text("token_hint").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    lastStatus: text("last_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("bot_webhooks_user_idx").on(table.userId)],
);
