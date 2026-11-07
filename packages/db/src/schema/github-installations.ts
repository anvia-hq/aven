import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { githubApps } from "./github-apps";
import { organizations } from "./organizations";
import { users } from "./users";

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
    installationId: bigint("installation_id", { mode: "number" }).notNull(),
    appId: uuid("app_id").references(() => githubApps.id),
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
