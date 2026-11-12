import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./users";

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  timezone: text("timezone"),
  followUpsEnabled: boolean("follow_ups_enabled").notNull().default(false),
  followUpsProviderId: text("follow_ups_provider_id"),
  followUpsModelId: text("follow_ups_model_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
