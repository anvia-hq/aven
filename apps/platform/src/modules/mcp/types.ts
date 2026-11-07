import type { McpTarget } from "@aven/protocol/types";

export type { McpTarget };

export type McpServer = {
  id: string;
  name: string;
  slug: string;
  url: string;
  headerNames: string[];
  target: McpTarget;
  enabled: boolean;
  allowLocal: boolean;
  lastError: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type McpHeaderInput = { name: string; value: string | null };

export type McpServerInput = {
  name: string;
  url: string;
  target: McpTarget;
  allowLocal: boolean;
  headers: McpHeaderInput[];
};
