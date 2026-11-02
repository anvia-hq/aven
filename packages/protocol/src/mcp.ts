// A person's MCP servers (decision 0085): remote servers their agents may use, as tools. The rules
// are shared by the control plane, which checks them, and the platform, which tells the person.

/** Whose agents may use a server: a person's bots, their thread agents, or both. */
export const MCP_TARGETS = ["all", "bots", "threads"] as const;
export type McpTarget = (typeof MCP_TARGETS)[number];

/** At most this many servers a person, and headers and characters in each. */
export const MCP_LIMIT = 20;
export const MCP_MAX_HEADERS = 10;
export const MCP_MAX_URL = 2000;
export const MCP_MAX_NAME = 40;
export const MCP_MAX_HEADER_VALUE = 4000;

/** A name a person gives a server: it starts the names of its tools, so it has to read as one. */
export const MCP_NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;

/** Header names that are not the person's to set: the connection owns them. */
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

/** An HTTP header name: letters, digits and the symbols RFC 9110 allows in a token. */
export const MCP_HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

/**
 * What a server's name comes to in a tool's name: `Team Notes` is `team_notes`, so its tools are
 * `team_notes_search`. Two names that come to the same one are one server.
 */
export const mcpSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
