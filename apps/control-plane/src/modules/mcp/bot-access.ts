import type { BotMcpView } from "@aven/protocol/mcp";
import type { McpConnectResult, RunMcpServer } from "@aven/protocol/runtime-wire";

import { UnprocessableError } from "../../errors";
import { mcpService, type McpServerView } from "./service";

export type BotMcp = {
  forRun(userId: string): Promise<RunMcpServer[]>;
  list(userId: string): Promise<BotMcpView[]>;
  add(
    userId: string,
    input: {
      name: string;
      url: string;
      headers?: { name: string; value: string }[];
      target?: BotMcpView["target"];
    },
  ): Promise<BotMcpView>;
  update(
    userId: string,
    id: string,
    patch: {
      name?: string;
      url?: string;
      headers?: { name: string; value: string }[];
      target?: BotMcpView["target"];
      enabled?: boolean;
    },
  ): Promise<BotMcpView>;
  remove(userId: string, id: string): Promise<void>;
  record(results: McpConnectResult[]): Promise<void>;
};

const seenByBot = ({
  id,
  name,
  url,
  target,
  enabled,
  headerNames,
  lastError,
}: McpServerView): BotMcpView => ({ id, name, url, target, enabled, headerNames, lastError });

const NOT_FOUND = "There is no MCP server with that id. Use list_mcp_servers.";

export const botMcp: BotMcp = {
  forRun: (userId) => mcpService.forRun(userId, "bots"),

  async list(userId) {
    return (await mcpService.list(userId)).map(seenByBot);
  },

  async add(userId, { name, url, headers = [], target = "all" }) {
    return seenByBot(
      await mcpService.create(userId, {
        name,
        url,
        headers,
        target,
        enabled: true,
        allowLocal: false,
      }),
    );
  },

  async update(userId, id, { name, url, headers, target, enabled }) {
    const current = await mcpService.get(userId, id);
    if (!current) throw new UnprocessableError(NOT_FOUND);
    const moved = url !== undefined && url !== current.url;
    const changed = await mcpService.update(userId, id, {
      name,
      url,
      target,
      enabled,
      headers: headers ?? (moved ? [] : undefined),
    });
    if (!changed) throw new UnprocessableError(NOT_FOUND);
    return seenByBot(changed);
  },

  async remove(userId, id) {
    if (!(await mcpService.remove(userId, id))) throw new UnprocessableError(NOT_FOUND);
  },

  record: (results) => mcpService.record(results),
};
