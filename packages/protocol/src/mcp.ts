export const MCP_TARGETS = ["all", "bots", "threads"] as const;
export type McpTarget = (typeof MCP_TARGETS)[number];

export type BotMcpView = {
  id: string;
  name: string;
  url: string;
  target: McpTarget;
  enabled: boolean;
  headerNames: string[];
  lastError: string | null;
};

export const MCP_LIMIT = 20;
export const MCP_MAX_HEADERS = 10;
export const MCP_MAX_URL = 2000;
export const MCP_MAX_NAME = 40;
export const MCP_MAX_HEADER_VALUE = 4000;

export const MCP_NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;

export const MCP_RESERVED_HEADERS = new Set([
  "host",
  "content-length",
  "content-type",
  "accept",
  "transfer-encoding",
  "connection",
  "mcp-session-id",
  "mcp-protocol-version",
]);

export const MCP_HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export const mcpSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
