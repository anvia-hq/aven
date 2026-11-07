import type { AnyTool } from "@anvia/core";
import { McpClient, type McpServer } from "@anvia/mcp";
import type { McpNote } from "@aven/agents/mcp";
import { errorMessage } from "@aven/agents/values";
import { mcpSlug } from "@aven/protocol/mcp";
import type { McpConnectResult, RunMcpServer } from "@aven/protocol/runtime-wire";

import { refusePrivateHost, type ResolveHost } from "./mcp-address";

export type ConnectedMcp = {
  tools: AnyTool[];
  results: McpConnectResult[];
  note: McpNote;
  close(): Promise<void>;
};

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
  const clients: McpClient[] = [];
  const servers: McpServer[] = [];
  const results: McpConnectResult[] = [];
  const failed: McpNote["failed"][number][] = [];

  const fail = (config: RunMcpServer, reason: string) => {
    results.push({ id: config.id, error: reason });
    failed.push({ name: config.name, reason });
  };

  await Promise.all(
    configs.map(async (config) => {
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
        servers.push(
          await client.connect({
            abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          }),
        );
        clients.push(client);
        results.push({ id: config.id });
      } catch (error) {
        fail(config, errorMessage(error));
        await client.close().catch(() => undefined);
      }
    }),
  );

  return {
    tools: servers.flatMap((server) => server.tools.map(asLocalTool)),
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
