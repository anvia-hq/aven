import type { AnyTool } from "@anvia/core";
import { McpClient, type McpServer } from "@anvia/mcp";
import { errorMessage } from "@aven/agents/values";

/** A remote MCP server a run was given: where it is and what to say to it (decision 0085). */
export type McpServerConfig = {
  /** What the person calls it; its tools are named after it. */
  name: string;
  url: string;
  headers: Record<string, string>;
  /** Whether a server on this machine or its network is let through, which is refused by default. */
  allowLocal: boolean;
};

export type ConnectedMcp = {
  /** For an agent that does not run through durable, as a bot's does: its `mcpServers`. */
  servers: McpServer[];
  /** The same tools as plain local tools, for an agent that does run through durable, which takes no `mcpServers`. */
  tools: AnyTool[];
  /** The servers that could not be reached, and why. The run goes on without them. */
  failed: { name: string; reason: string }[];
  close(): Promise<void>;
};

/** How long a server has to answer, connecting and listing its tools. */
export const MCP_CONNECT_TIMEOUT_MS = 15_000;

// What a server may list: a runaway one cannot fill the agent's context with its own tools.
const DISCOVERY_LIMITS = { maxTools: 100, maxBytes: 512 * 1024 };

/** A tool name a model accepts: letters, digits, underscore and dash. */
export const mcpPrefix = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_`;

// Anvia's adapted tool is a plain object that says where it came from in `mcp`, which an agent's
// `tools` refuses and durable cannot checkpoint a server for. Without that mark it is a local tool
// whose `call` still goes through the live connection.
const asLocalTool = (tool: McpServer["tools"][number]): AnyTool => {
  const { mcp: _origin, ...local } = tool;
  return local;
};

// Connects the servers a run was given, each by itself: one that is down is reported and left out,
// it does not stop the others or the run. The connections are the run's: `close` ends them.
export async function connectMcpServers(
  configs: readonly McpServerConfig[],
  signal?: AbortSignal,
): Promise<ConnectedMcp> {
  const clients: McpClient[] = [];
  const servers: McpServer[] = [];
  const failed: ConnectedMcp["failed"] = [];

  await Promise.all(
    configs.map(async (config) => {
      const client = new McpClient({
        name: config.name,
        transport: {
          type: "streamableHttp",
          url: config.url,
          headers: config.headers,
          // Refused unless the person said the server is on their own network.
          ssrfProtection: config.allowLocal ? "disabled" : "strict",
        },
        // A server on the 2025 protocol is as good as one on the newest.
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
      } catch (error) {
        failed.push({ name: config.name, reason: errorMessage(error) });
        await client.close().catch(() => undefined);
      }
    }),
  );

  return {
    servers,
    tools: servers.flatMap((server) => server.tools.map(asLocalTool)),
    failed,
    close: async () => {
      await Promise.all(clients.map((client) => client.close().catch(() => undefined)));
    },
  };
}
