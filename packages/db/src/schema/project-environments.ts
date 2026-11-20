import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { ENVIRONMENT_STATUSES, RUNTIME_PROVIDERS } from "@aven/protocol/runtime-wire";

import { cloudProviderConfigs } from "./cloud-provider-configs";
import { organizations } from "./organizations";
import { projects } from "./projects";

export const projectEnvironments = pgTable(
  "project_environments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: RUNTIME_PROVIDERS }).notNull(),
    providerConfigId: uuid("provider_config_id").references(() => cloudProviderConfigs.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    setupDigest: text("setup_digest").notNull(),
    status: text("status", { enum: ENVIRONMENT_STATUSES }).notNull().default("saving"),
    error: text("error"),
    savedAt: timestamp("saved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deleteAttempts: integer("delete_attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_environments_project_provider_idx").on(table.projectId, table.provider),
    index("project_environments_expiry_idx").on(table.expiresAt),
    index("project_environments_status_retry_idx").on(table.status, table.nextRetryAt),
  ],
);
