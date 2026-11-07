import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./users";

export const providers = pgTable(
  "providers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["openai", "anthropic", "gemini", "bedrock", "vertex", "azure", "openai-compatible"],
    }).notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url"),
    modelId: text("model_id"),
    apiKeyEncrypted: text("api_key_encrypted"),
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
    uniqueIndex("providers_user_default_idx")
      .on(table.userId)
      .where(sql`${table.isDefault}`),
  ],
);
