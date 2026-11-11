import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { AGENT_HOSTS, RUNTIME_PROVIDERS } from "@aven/protocol/runtime-wire";

import { organizations } from "./organizations";
import { users } from "./users";

export const runtimes = pgTable(
  "runtimes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    host: boolean("host").notNull().default(false),
    provider: text("provider", { enum: RUNTIME_PROVIDERS }).notNull().default("manual"),
    agentHost: text("agent_host", { enum: AGENT_HOSTS }).notNull().default("machine"),
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
    uniqueIndex("runtimes_token_hash_idx").on(table.tokenHash),
  ],
);
