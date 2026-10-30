import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./users";

// A model provider a user has set up. Tied to the user, not to an organization: it follows them
// into every workspace. The API key is stored encrypted (AES-256-GCM); only `keyHint` is shown.
export const providers = pgTable(
  "providers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["openai", "anthropic", "azure", "openai-compatible"] }).notNull(),
    name: text("name").notNull(),
    /** The server root for "openai-compatible", the resource URL for "azure". */
    baseUrl: text("base_url"),
    modelId: text("model_id"),
    /** `iv.tag.ciphertext`, base64 parts. Null when a compatible endpoint needs no key. */
    apiKeyEncrypted: text("api_key_encrypted"),
    /** Last characters of the key, safe to display. */
    keyHint: text("key_hint"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("providers_user_idx").on(table.userId),
    // At most one default provider per user.
    uniqueIndex("providers_user_default_idx")
      .on(table.userId)
      .where(sql`${table.isDefault}`),
  ],
);

export type ProviderRow = typeof providers.$inferSelect;
export type NewProviderRow = typeof providers.$inferInsert;
