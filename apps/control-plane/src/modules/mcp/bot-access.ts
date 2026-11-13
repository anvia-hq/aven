import { UnprocessableError } from "@aven/server-kit/errors";
import { createMcpBody, updateMcpBody } from "./schema";
import { mcpService } from "./service";
import type { BotMcp, McpServerView } from "./types";
import type { BotMcpView } from "@aven/protocol/types";
import type { z } from "zod";

function checked<Schema extends z.ZodType>(schema: Schema, body: unknown): z.output<Schema> {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new UnprocessableError(result.error.issues[0]?.message ?? "The MCP server is not valid");
  }

  return result.data;
}

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

  async add(userId, input) {
    const body = checked(createMcpBody, {
      name: input.name,
      url: input.url,
      headers: input.headers ?? [],
      target: input.target ?? "all",
      enabled: true,
      allowLocal: false,
    });
    return seenByBot(await mcpService.create(userId, body));
  },

  async update(userId, id, input) {
    const current = await mcpService.get(userId, id);

    if (!current) throw new UnprocessableError(NOT_FOUND);

    const { name, url, headers, target, enabled } = checked(
      updateMcpBody,
      Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
    );
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
