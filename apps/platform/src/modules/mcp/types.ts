import type { McpTarget } from "@aven/protocol/mcp";

export type { McpTarget };

/** A remote MCP server of the signed-in person's (decision 0085). A header's value is never sent back, only its name. */
export type McpServer = {
  id: string;
  name: string;
  slug: string;
  url: string;
  headerNames: string[];
  target: McpTarget;
  enabled: boolean;
  allowLocal: boolean;
  /** Why the last run that tried could not connect; null once one did. */
  lastError: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What the form sends for a header: a saved one with no `value` keeps the value it has. */
export type McpHeaderInput = { name: string; value: string | null };

export type McpServerInput = {
  name: string;
  url: string;
  target: McpTarget;
  allowLocal: boolean;
  headers: McpHeaderInput[];
};
