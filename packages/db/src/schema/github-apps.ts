import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { users } from "./users";

// A GitHub App a workspace made for itself (decision 0123). A workspace without one uses the
// platform's, which is kept in `platform_settings` (decision 0074). The app's credentials (id,
// private key, client id and secret) are one encrypted JSON, as the platform's are.
export const githubApps = pgTable("github_apps", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** The app's name on GitHub, which its install page is under: `github.com/apps/<slug>`. */
  slug: text("slug").notNull(),
  credentialsEncrypted: text("credentials_encrypted").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type GithubAppRow = typeof githubApps.$inferSelect;
