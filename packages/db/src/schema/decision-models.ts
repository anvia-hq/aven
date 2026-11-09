import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

export const decisionModels = pgTable("decision_models", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["jev", "jev-openrouter"] }).notNull(),
  modelId: text("model_id").notNull(),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  keyHint: text("key_hint").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
