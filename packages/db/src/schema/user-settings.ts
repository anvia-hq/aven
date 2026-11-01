import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./users";

// What a person has chosen for themselves that the server needs to know: their timezone, so that
// what a bot schedules for "7 in the morning" is theirs (decision 0067).
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** An IANA name such as `Asia/Jakarta`; none until the person's browser or the person says. */
  timezone: text("timezone"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
