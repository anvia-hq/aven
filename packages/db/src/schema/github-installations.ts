import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { githubApps } from "./github-apps";
import { organizations } from "./organizations";
import { users } from "./users";

// A GitHub App installation an organization has connected (decision 0013). The repositories it
// can see are asked of GitHub each time; only the ones imported become projects.
export const githubInstallations = pgTable(
  "github_installations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectedBy: text("connected_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** GitHub's id for the installation. */
    installationId: bigint("installation_id", { mode: "number" }).notNull(),
    /** The workspace's own app this is an installation of; null for the platform's (decision 0123). */
    appId: uuid("app_id").references(() => githubApps.id, { onDelete: "restrict" }),
    /** The user or organization the app is installed on. */
    accountLogin: text("account_login").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("github_installations_organization_idx").on(table.organizationId),
    uniqueIndex("github_installations_org_installation_idx").on(
      table.organizationId,
      table.installationId,
    ),
  ],
);

export type GithubInstallation = typeof githubInstallations.$inferSelect;
export type NewGithubInstallation = typeof githubInstallations.$inferInsert;
