import { createTool } from "@anvia/core";
import { z } from "zod";

export const SEND_MESSAGE_TOOL_NAME = "send_message";

export const sendMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe("One message, as you would text it: short, one thought, plain text."),
});

/** What the host does with a message: shows it to the person, once it has been "typed". */
export type DeliverMessage = (
  text: string,
  context: { abortSignal?: AbortSignal },
) => Promise<void>;

// The only way a bot speaks (decision 0058). What delivering takes, such as the pause that makes it
// look typed, is the host's.
export function createSendMessageTool(deliver: DeliverMessage) {
  return createTool({
    name: SEND_MESSAGE_TOOL_NAME,
    description:
      "Send the person a message. It is the only way they hear from you: nothing you write outside this tool is seen. Call it again for another message; they arrive in order, each after a short pause as if typed.",
    inputSchema: sendMessageSchema,
    async execute({ text }, context) {
      await deliver(text, { abortSignal: context?.abortSignal });
      return { sent: true };
    },
  });
}
