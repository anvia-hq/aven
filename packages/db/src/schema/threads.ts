import {
  index,
  jsonb,
  type AnyPgColumn,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { AGENT_BACKENDS } from "@aven/protocol/runtime-wire";

import { organizations } from "./organizations";
import { projects } from "./projects";
import { runtimes } from "./runtimes";
import { users } from "./users";

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
    lastRunBy: text("last_run_by").references(() => users.id, { onDelete: "set null" }),
    runtimeId: uuid("runtime_id")
      .notNull()
      .references(() => runtimes.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    agentBackend: text("agent_backend", { enum: AGENT_BACKENDS }).notNull().default("native"),
    parentThreadId: uuid("parent_thread_id").references((): AnyPgColumn => threads.id, {
      onDelete: "set null",
    }),
    visibility: text("visibility", { enum: ["private", "workspace"] })
      .notNull()
      .default("private"),
    drivingUntil: timestamp("driving_until", { withTimezone: true }),
    state: text("state", { enum: ["open", "snoozed", "archived"] })
      .notNull()
      .default("open"),
    pendingContinuation: jsonb("pending_continuation"),
    lastError: text("last_error"),
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
