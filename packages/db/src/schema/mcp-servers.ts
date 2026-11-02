import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

// A remote MCP server a user connected (decision 0085). Tied to the user, like skills and
// providers: it goes with them into every organization, and only their own agents use it.
export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** What the user calls it; the start of its tools' names. */
    name: text("name").notNull(),
    /** The name as it is in a tool's name: two names with the same one are one server. */
    slug: text("slug").notNull(),
    url: text("url").notNull(),
    /** The headers sent to it, a JSON object of name to value, encrypted: they hold tokens. */
    headers: text("headers").notNull(),
    /** The headers' names, in the clear, for showing. Their values are never read back. */
    headerNames: text("header_names").array().notNull().default([]),
    /** Whose agents use it: `all`, `bots` or `threads`. */
    target: text("target", { enum: ["all", "bots", "threads"] })
      .notNull()
      .default("all"),
    enabled: boolean("enabled").notNull().default(true),
    /** Whether the server may be on the runner's own machine or network. */
    allowLocal: boolean("allow_local").notNull().default(false),
    /** Why the last run that tried could not connect; null once one did. */
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
