import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    url: text("url").notNull(),
    headers: text("headers").notNull(),
    headerNames: text("header_names").array().notNull().default([]),
    target: text("target", { enum: ["all", "bots", "threads"] })
      .notNull()
      .default("all"),
    enabled: boolean("enabled").notNull().default(true),
    allowLocal: boolean("allow_local").notNull().default(false),
    lastError: text("last_error"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("mcp_servers_user_slug_idx").on(table.userId, table.slug),
    index("mcp_servers_user_idx").on(table.userId),
  ],
);

export type McpServerRow = typeof mcpServers.$inferSelect;
