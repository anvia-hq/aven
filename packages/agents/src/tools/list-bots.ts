import { createTool } from "@anvia/core";
import type { BotPeer } from "@aven/protocol/runtime-wire";
import { z } from "zod";

export const LIST_BOTS_TOOL_NAME = "list_bots";

// The bots a bot may write to (decision 0065), with the handle each is written to by. Which they
// are, and the one just made, is the host's.
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
