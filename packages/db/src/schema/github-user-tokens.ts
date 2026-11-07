import { bigint, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

export const githubUserTokens = pgTable(
  "github_user_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    appKey: text("app_key").notNull().default("platform"),
    githubUserId: bigint("github_user_id", { mode: "number" }).notNull(),
    login: text("login").notNull(),
    name: text("name"),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique("github_user_tokens_user_app_unique").on(table.userId, table.appKey)],
);
