import { createTool } from "@anvia/core";
import {
  MCP_MAX_HEADER_VALUE,
  MCP_MAX_HEADERS,
  MCP_MAX_NAME,
  MCP_MAX_URL,
  MCP_TARGETS,
} from "@aven/protocol/mcp";
import { z } from "zod";
import type { McpServersHost } from "./types";

export const LIST_MCP_SERVERS_TOOL_NAME = "list_mcp_servers";
export const ADD_MCP_SERVER_TOOL_NAME = "add_mcp_server";
export const UPDATE_MCP_SERVER_TOOL_NAME = "update_mcp_server";
export const REMOVE_MCP_SERVER_TOOL_NAME = "remove_mcp_server";

const name = z
  .string()
  .trim()
  .min(1)
  .max(MCP_MAX_NAME)
  .describe(
    "A short name: letters, digits, spaces, dashes and underscores. The server's tools are named after it.",
  );
const url = z
  .string()
  .trim()
  .max(MCP_MAX_URL)
  .describe("The server's http or https address, with no user name or password in it.");
const headers = z
  .array(
    z.object({
      name: z.string().trim().min(1).describe("The header's name, such as Authorization."),
      value: z
        .string()
        .min(1)
        .max(MCP_MAX_HEADER_VALUE)
        .describe("The header's value, such as `Bearer <token>`. It is a secret."),
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

export function createMcpServerTools(host: McpServersHost) {
  const list = createTool({
    name: LIST_MCP_SERVERS_TOOL_NAME,
    description:
      "List the person's MCP servers: their names, addresses, who uses them, whether they are enabled, the names of their headers (never the values) and why the last attempt to connect failed, if it did.",
    inputSchema: z.object({}),
    execute: async () => ({ servers: await host.list() }),
  });
  const add = createTool({
    name: ADD_MCP_SERVER_TOOL_NAME,
    description:
      "Add a remote MCP server for the person, when they ask you to connect one and give you its address. It is used from the next message on. Tell the person what you added.",
    inputSchema: addSchema,
    execute: async (input) => ({ server: await host.add(input) }),
  });
  const update = createTool({
    name: UPDATE_MCP_SERVER_TOOL_NAME,
    description:
      "Change an MCP server. Give only what changes. Use enabled: false to switch it off and enabled: true to switch it on.",
    inputSchema: updateSchema,
    execute: async ({ id, ...patch }) => ({ server: await host.update(id, patch) }),
  });
  const remove = createTool({
    name: REMOVE_MCP_SERVER_TOOL_NAME,
    description: "Remove an MCP server for good. Switch it off instead if unsure.",
    inputSchema: z.object({ id: z.uuid().describe("The server id from list_mcp_servers.") }),
    execute: async ({ id }) => {
      await host.remove(id);
      return { removed: true };
    },
  });
  return [list, add, update, remove] as const;
}
