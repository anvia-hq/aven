import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { users } from "./users";

// A machine a user attached to an organization to run agents on (decision 0008). It belongs to the
// user who registered it and is shared with the whole organization. Projects point at one;
// a project with no runtime uses the control plane's own machine.
export const runtimes = pgTable(
  "runtimes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** SHA-256 of the connection token, hex. The token itself is shown once and never stored. */
    tokenHash: text("token_hash").notNull(),
    /** Last characters of the token, safe to display. */
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

export type RuntimeRow = typeof runtimes.$inferSelect;
export type NewRuntimeRow = typeof runtimes.$inferInsert;
