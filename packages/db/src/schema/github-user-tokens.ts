import { bigint, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

// A person's GitHub account, connected so that shipping acts as them (decision 0041). Tied to the
// user, not to an organization: a GitHub account is the person's. A user token is one app's and
// works for no other, so there is a row for each app the person connected for (decision 0123).
// Both tokens are stored encrypted (AES-256-GCM, `iv.tag.ciphertext`).
export const githubUserTokens = pgTable(
  "github_user_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `platform` for the platform's app, else the id of the workspace's `github_apps` row. */
    appKey: text("app_key").notNull().default("platform"),
    /** GitHub's id of the account, which names the commit email `<id>+<login>@users.noreply.github.com`. */
    githubUserId: bigint("github_user_id", { mode: "number" }).notNull(),
    login: text("login").notNull(),
    /** The account's display name, if it has one. */
    name: text("name"),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    /** Null for an app whose user tokens do not expire. */
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
    /** Null when GitHub gave none (tokens that do not expire). */
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

export type GithubUserTokenRow = typeof githubUserTokens.$inferSelect;
