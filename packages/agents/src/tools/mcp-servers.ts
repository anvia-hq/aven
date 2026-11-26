import { createTool } from "@anvia/core";
import { MCP_MAX_HEADERS, MCP_TARGETS } from "@aven/protocol/mcp";
import { mcpHeaderName, mcpHeaderValue, mcpName, mcpUrl } from "@aven/protocol/mcp-schema";
import { z } from "zod";
import type { McpServersHost } from "./types";
import type { BotMcpView } from "@aven/protocol/types";

export const LIST_MCP_SERVERS_TOOL_NAME = "list_mcp_servers";
export const ADD_MCP_SERVER_TOOL_NAME = "add_mcp_server";
export const UPDATE_MCP_SERVER_TOOL_NAME = "update_mcp_server";
export const REMOVE_MCP_SERVER_TOOL_NAME = "remove_mcp_server";

const name = mcpName.describe(
  "A short name: letters, digits, spaces, dashes and underscores. The server's tools are named after it.",
);
const url = mcpUrl.describe(
  "The server's http or https address, with no user name or password in it.",
);
const headers = z
  .array(
    z.object({
      name: mcpHeaderName.describe("The header's name, such as Authorization."),
      value: mcpHeaderValue.describe(
        "The header's value, such as `Bearer <token>`. It is a secret.",
      ),
    }),
  )
  .max(MCP_MAX_HEADERS);
const target = z
  .enum(MCP_TARGETS)
  .describe(
    "Whose agents use it: `all`, `bots` (the person's bots) or `threads` (the agents in their coding threads).",
  );

const addSchema = z.object({
  name,
  url,
  headers: headers
    .optional()
    .describe(
      "Only what the person gave you for it, usually a token. Never invent one, and never repeat one back.",
    ),
  target: target.optional(),
});
const updateSchema = z.object({
  id: z.uuid().describe("The server id from list_mcp_servers."),
  name: name.optional(),
  url: url.optional(),
  headers: headers
    .optional()
    .describe(
      "The server's whole set of headers: it replaces the saved ones, whose values you cannot see. Moving a server to another address clears them, so give them again if it still needs them.",
    ),
  target: target.optional(),
  enabled: z.boolean().optional(),
});

export type McpServerInput = z.infer<typeof addSchema>;
export type McpServerPatch = Omit<z.infer<typeof updateSchema>, "id">;

function formatServer(server: BotMcpView) {
  const parts = [
    server.id,
    server.name,
    server.url,
    `target ${server.target}`,
    server.enabled ? "enabled" : "disabled",
  ];

  if (server.headerNames.length > 0) parts.push(`headers ${server.headerNames.join(", ")}`);

  if (server.lastError) parts.push(`error: ${server.lastError}`);

  return `- ${parts.join(" · ")}`;
}

export function createMcpServerTools(host: McpServersHost) {
  const list = createTool({
    name: LIST_MCP_SERVERS_TOOL_NAME,
    description:
      "List the person's MCP servers: their names, addresses, who uses them, whether they are enabled, the names of their headers (never the values) and why the last attempt to connect failed, if it did.",
    inputSchema: z.object({}),
    handler: async () => {
      const servers = await host.list();
      return servers.length > 0
        ? servers.map(formatServer).join("\n")
        : "No MCP servers configured.";
    },
  });
  const add = createTool({
    name: ADD_MCP_SERVER_TOOL_NAME,
    description:
      "Add a remote MCP server for the person, when they ask you to connect one and give you its address. It is used from the next message on. Tell the person what you added.",
    inputSchema: addSchema,
    handler: async (input) => {
      const server = await host.add(input);
      return `Added MCP server ${server.name} (${server.id}) at ${server.url} (target: ${server.target}).`;
    },
  });
  const update = createTool({
    name: UPDATE_MCP_SERVER_TOOL_NAME,
    description:
      "Change an MCP server. Give only what changes. Use enabled: false to switch it off and enabled: true to switch it on.",
    inputSchema: updateSchema,
    handler: async ({ id, ...patch }) => {
      const server = await host.update(id, patch);
      return `Updated MCP server:\n${formatServer(server)}`;
    },
  });
  const remove = createTool({
    name: REMOVE_MCP_SERVER_TOOL_NAME,
    description: "Remove an MCP server for good. Switch it off instead if unsure.",
    inputSchema: z.object({ id: z.uuid().describe("The server id from list_mcp_servers.") }),
    handler: async ({ id }) => {
      await host.remove(id);
      return `Removed MCP server ${id}.`;
    },
  });
  return [list, add, update, remove] as const;
}
