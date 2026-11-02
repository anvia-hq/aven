import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { githubInstallations } from "./github-installations";
import { organizations } from "./organizations";
import { runtimes } from "./runtimes";
import { users } from "./users";

// A project is an imported GitHub repository and the runner its threads' sandboxes run on (decision
// 0013). Threads always belong to one; each clones the repository into its own sandbox.
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The runner that hosts the project's sandboxes (decision 0010). */
    runtimeId: uuid("runtime_id")
      .notNull()
      .references(() => runtimes.id, { onDelete: "restrict" }),
    /** The installation that gives the control plane read access to the repository. */
    githubInstallationId: uuid("github_installation_id")
      .notNull()
      .references(() => githubInstallations.id, { onDelete: "restrict" }),
    /** `owner/name`, as GitHub spells it. */
    repoFullName: text("repo_full_name").notNull(),
    cloneUrl: text("clone_url").notNull(),
    defaultBranch: text("default_branch").notNull(),
    name: text("name").notNull(),
    /**
     * When the project was deleted. A deleted project is only hidden: its threads stay, archived,
     * for what counts them, and its repository can be imported again (decision 0094).
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("projects_organization_updated_idx").on(table.organizationId, table.updatedAt),
    index("projects_runtime_idx").on(table.runtimeId),
    // One live project a repository in a workspace; a deleted one does not hold the repository.
    uniqueIndex("projects_org_repo_idx")
      .on(table.organizationId, table.repoFullName)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
