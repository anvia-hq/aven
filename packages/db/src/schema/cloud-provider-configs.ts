import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { CLOUD_PROVIDER_CONFIG_STATUSES, RUNTIME_PROVIDERS } from "@aven/protocol/runtime-wire";

export const cloudProviderConfigs = pgTable(
  "cloud_provider_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider", { enum: RUNTIME_PROVIDERS }).notNull(),
    status: text("status", { enum: CLOUD_PROVIDER_CONFIG_STATUSES }).notNull().default("active"),
    base: text("base").notNull().default(""),
    project: text("project").notNull().default(""),
    runnerUrl: text("runner_url").notNull().default(""),
    apiKeyEncrypted: text("api_key_encrypted"),
    keyHint: text("key_hint").notNull().default(""),
    computeMicrosPerHour: integer("compute_micros_per_hour"),
    storageMicrosPerGbMonth: integer("storage_micros_per_gb_month"),
    drainingSince: timestamp("draining_since", { withTimezone: true }),
    drainedAt: timestamp("drained_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("cloud_provider_configs_active_idx")
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
    index("cloud_provider_configs_status_idx").on(table.status),
  ],
);
