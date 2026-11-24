import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { projects } from "./projects";
import { runtimes } from "./runtimes";
import { threads } from "./threads";
import { users } from "./users";

export const automations = pgTable(
  "automations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runtimeId: uuid("runtime_id")
      .notNull()
      .references(() => runtimes.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    triggerKind: text("trigger_kind", { enum: ["webhook", "schedule"] }).notNull(),
    cron: text("cron"),
    timezone: text("timezone"),
    webhookTokenHash: text("webhook_token_hash").unique(),
    webhookTokenHint: text("webhook_token_hint"),
    prompt: text("prompt").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: text("last_status", { enum: ["running", "done", "failed"] }),
    lastThreadId: uuid("last_thread_id").references(() => threads.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("automations_org_user_idx").on(table.organizationId, table.userId),
    index("automations_due_idx").on(table.enabled, table.triggerKind, table.nextRunAt),
  ],
);
