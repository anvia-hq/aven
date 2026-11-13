import { createTool } from "@anvia/core";
import { BOT_MESSAGE_ID, BOT_REACTION_MAX, isBotReaction } from "@aven/protocol/bots";
import { z } from "zod";
import type { ReactToMessage } from "./types";

export const REACT_TO_MESSAGE_TOOL_NAME = "react_to_message";

export const reactToMessageSchema = z.object({
  messageId: z
    .string()
    .trim()
    .regex(BOT_MESSAGE_ID)
    .describe("The id of the message, which is in square brackets where it starts, such as `m-3`."),
  emoji: z
    .string()
    .trim()
    .min(1)
    .max(BOT_REACTION_MAX)
    .refine(isBotReaction, "One emoji, such as 👍 or 🎉.")
    .describe("One emoji, the way you would tap a reaction in a messaging app."),
});

export type ReactToMessageInput = z.infer<typeof reactToMessageSchema>;

export function createReactToMessageTool(react: ReactToMessage) {
  return createTool({
    name: REACT_TO_MESSAGE_TOOL_NAME,
    description:
      "React to a message in the chat with one emoji, as you would tap one in a messaging app. The reaction shows on that message and says nothing else, so send a message as well when you have something to say.",
    inputSchema: reactToMessageSchema,
    async execute(input) {
      return react(input);
    },
  });
}
