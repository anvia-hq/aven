import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import {
  BOAT_MACHINE_TYPES,
  CLOUD_SANDBOX_STATES,
  RUNTIME_PROVIDERS,
} from "@aven/protocol/runtime-wire";

import { cloudProviderConfigs } from "./cloud-provider-configs";
import { runtimes } from "./runtimes";

export const cloudSandboxes = pgTable(
  "cloud_sandboxes",
  {
    runtimeId: uuid("runtime_id")
      .primaryKey()
      .references(() => runtimes.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: RUNTIME_PROVIDERS }).notNull(),
    providerConfigId: uuid("provider_config_id").references(() => cloudProviderConfigs.id, {
      onDelete: "set null",
    }),
    externalId: text("external_id"),
    machineType: text("machine_type", { enum: BOAT_MACHINE_TYPES }).notNull().default("default"),
    state: text("state", { enum: CLOUD_SANDBOX_STATES }).notNull().default("absent"),
    dirty: boolean("dirty").notNull().default(false),
    runtimeSnapshotName: text("runtime_snapshot_name"),
    runningSince: timestamp("running_since", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    drainRequestedAt: timestamp("drain_requested_at", { withTimezone: true }),
    lastExtendedAt: timestamp("last_extended_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deleteAttempts: integer("delete_attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("cloud_sandboxes_state_expires_idx").on(table.state, table.expiresAt),
    index("cloud_sandboxes_state_retry_idx").on(table.state, table.nextRetryAt),
    index("cloud_sandboxes_config_state_idx").on(table.providerConfigId, table.state),
  ],
);
