import { createTool } from "@anvia/core";
import { z } from "zod";
import type { BotPeer } from "@aven/protocol/types";

export const LIST_BOTS_TOOL_NAME = "list_bots";

export function createListBotsTool(list: () => readonly BotPeer[]) {
  return createTool({
    name: LIST_BOTS_TOOL_NAME,
    description:
      "List the person's other bots you can write to with send_message, with each one's handle and what it does.",
    inputSchema: z.object({}),
    async execute() {
      return { bots: list() };
    },
  });
}
