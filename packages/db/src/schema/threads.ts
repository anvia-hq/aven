import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { projects } from "./projects";
import { runtimes } from "./runtimes";
import { users } from "./users";

// A thread is one agent session, and always belongs to a project. Its conversation lives in the
// agent memory tables, keyed by this id, and its sandbox (an empty workspace on the project's
// runner) is keyed by it too.
export const threads = pgTable(
  "threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Who the thread's latest run was sent as. Its sandbox holds that person's GitHub sign-in and
     * personal variables until the next run replaces them (decisions 0044, 0045); null until a run.
     */
    lastRunBy: text("last_run_by").references(() => users.id, { onDelete: "set null" }),
    /** The runner the thread's sandbox runs on, copied from the project when the thread is created. */
    runtimeId: uuid("runtime_id")
      .notNull()
      .references(() => runtimes.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    state: text("state", { enum: ["open", "snoozed", "archived"] })
      .notNull()
      .default("open"),
    /**
     * What resumes the run that stopped to ask the user a question (Anvia's continuation, opaque
     * here; decision 0020). Set while the question is unanswered, otherwise null.
     */
    pendingContinuation: jsonb("pending_continuation"),
    /** The pull request opened for the thread's branch (decision 0044); both null until one is found. */
    pullRequestNumber: integer("pull_request_number"),
    pullRequestUrl: text("pull_request_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("threads_organization_updated_idx").on(table.organizationId, table.updatedAt),
    index("threads_project_idx").on(table.projectId),
    index("threads_runtime_idx").on(table.runtimeId),
  ],
);

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
