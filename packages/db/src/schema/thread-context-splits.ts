import { integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { threads } from "./threads";

export const threadContextSplits = pgTable("thread_context_splits", {
  threadId: uuid("thread_id")
    .primaryKey()
    .references(() => threads.id, { onDelete: "cascade" }),
  usedTokens: integer("used_tokens").notNull(),
  segments: jsonb("segments").$type<{ id: string; tokens: number }[]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
