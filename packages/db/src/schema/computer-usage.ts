import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { BOAT_MACHINE_TYPES } from "@aven/protocol/runtime-wire";

import { cloudProviderConfigs } from "./cloud-provider-configs";
import { organizations } from "./organizations";
import { runtimes } from "./runtimes";
import { users } from "./users";

export const computerUsage = pgTable(
  "computer_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runtimeId: uuid("runtime_id")
      .notNull()
      .references(() => runtimes.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    providerConfigId: uuid("provider_config_id").references(() => cloudProviderConfigs.id, {
      onDelete: "set null",
    }),
    machineType: text("machine_type", { enum: BOAT_MACHINE_TYPES }),
    estimatedCostMicros: integer("estimated_cost_micros"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("computer_usage_open_idx")
      .on(table.runtimeId)
      .where(sql`${table.stoppedAt} is null`),
    index("computer_usage_org_started_idx").on(table.organizationId, table.startedAt),
  ],
);
