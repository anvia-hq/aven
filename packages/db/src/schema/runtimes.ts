import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { users } from "./users";

// A runner: a computer or VM that hosts sandboxes (decisions 0008 and 0010). One a user attached
// belongs to them and is shared with the whole organization. The control plane's own built-in
// runner has no organization and no owner: every organization sees it, nobody can revoke it.
export const runtimes = pgTable(
  "runtimes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
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
