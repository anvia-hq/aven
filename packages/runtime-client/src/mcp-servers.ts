import type { AnyTool } from "@anvia/core";
import { McpClient, type McpServer } from "@anvia/mcp";
import { errorMessage } from "@aven/agents/values";
import { mcpSlug } from "@aven/protocol/mcp";

import { refusePrivateHost } from "./mcp-address";
import type { McpNote } from "@aven/agents/types";
import type { McpConnectResult, RunMcpServer } from "@aven/protocol/types";
import type { ConnectedMcp, ConnectedMcpServer, ResolveHost } from "./types";

export const MCP_CONNECT_TIMEOUT_MS = 15_000;

const DISCOVERY_LIMITS = { maxTools: 100, maxBytes: 512 * 1024 };

export const mcpPrefix = (name: string) => `${mcpSlug(name)}_`;

const asLocalTool = (tool: McpServer["tools"][number]): AnyTool => {
  const { mcp: _origin, ...local } = tool;
  return local;
};

export async function connectMcpServers(
  configs: readonly RunMcpServer[],
  options: { signal?: AbortSignal; resolve?: ResolveHost } = {},
): Promise<ConnectedMcp> {
  const { signal, resolve } = options;
  const connections: (Connection | undefined)[] = configs.map(() => undefined);
  const results: McpConnectResult[] = [];
  const failed: McpNote["failed"][number][] = [];

  const fail = (config: RunMcpServer, reason: string) => {
    results.push({ id: config.id, error: reason });
    failed.push({ name: config.name, reason });
  };

  await Promise.all(
    configs.map(async (config, index) => {
      if (!config.allowLocal) {
        try {
          await refusePrivateHost(config.url, resolve);
        } catch (error) {
          fail(config, errorMessage(error));
          return;
        }
      }

      const client = new McpClient({
        name: config.name,
        transport: {
          type: "streamableHttp",
          url: config.url,
          headers: config.headers,
          ssrfProtection: config.allowLocal ? "disabled" : "strict",
        },
        versionNegotiation: { mode: "auto" },
        tools: { prefix: mcpPrefix(config.name), discoveryLimits: DISCOVERY_LIMITS },
      });
      const timeout = AbortSignal.timeout(MCP_CONNECT_TIMEOUT_MS);
      try {
        const server = await client.connect({
          abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        connections[index] = { config, client, server };
      } catch (error) {
        fail(config, errorMessage(error));
        await client.close().catch(() => undefined);
      }
    }),
  );

  const clients: McpClient[] = [];
  const servers: McpServer[] = [];
  const grouped: ConnectedMcpServer[] = [];
  const taken = new Map<string, string>();
  for (const connection of connections) {
    if (!connection) continue;

    const { config, client, server } = connection;
    const clash = server.tools.map((tool) => tool.name).find((name) => taken.has(name));

    if (clash !== undefined) {
      fail(
        config,
        `Its tool ${clash} has the same name as a tool of the server ${taken.get(clash)}; rename one of the two servers`,
      );
      await client.close().catch(() => undefined);
      continue;
    }

    for (const tool of server.tools) taken.set(tool.name, config.name);
    clients.push(client);
    servers.push(server);
    grouped.push({ id: config.id, name: config.name, tools: server.tools.map(asLocalTool) });
    results.push({ id: config.id });
  }

  return {
    tools: grouped.flatMap((server) => server.tools),
    servers: grouped,
    results,
    note: {
      servers: servers.map((server) => ({ name: server.name, tools: server.tools.length })),
      failed,
    },
    close: async () => {
      await Promise.all(clients.map((client) => client.close().catch(() => undefined)));
    },
  };
}

type Connection = { config: RunMcpServer; client: McpClient; server: McpServer };
