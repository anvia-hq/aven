import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  BOAT_MACHINE_TYPES,
  RUNTIME_GITHUB_MODES,
  RUNTIME_LIFETIMES,
  RUNTIME_PROVIDERS,
} from "@aven/protocol/runtime-wire";

import { organizations } from "./organizations";
import { users } from "./users";

export const runtimes = pgTable(
  "runtimes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    parentRuntimeId: uuid("parent_runtime_id").references((): AnyPgColumn => runtimes.id, {
      onDelete: "cascade",
    }),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    host: boolean("host").notNull().default(false),
    provider: text("provider", { enum: RUNTIME_PROVIDERS }).notNull().default("manual"),
    lifetime: text("lifetime", { enum: RUNTIME_LIFETIMES }).notNull().default("persistent"),
    githubMode: text("github_mode", { enum: RUNTIME_GITHUB_MODES }).notNull().default("machine"),
    boatMachineType: text("boat_machine_type", { enum: BOAT_MACHINE_TYPES }),
    boatSandboxId: text("boat_sandbox_id"),
    environmentSnapshot: text("environment_snapshot"),
    boatRunnerTokenEncrypted: text("boat_runner_token_encrypted"),
    shared: boolean("shared").notNull().default(false),
    directories: text("directories")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    tokenHash: text("token_hash").notNull(),
    tokenHint: text("token_hint").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("runtimes_organization_idx").on(table.organizationId),
    index("runtimes_parent_idx").on(table.parentRuntimeId),
    uniqueIndex("runtimes_token_hash_idx").on(table.tokenHash),
  ],
);
