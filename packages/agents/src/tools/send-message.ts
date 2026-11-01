import { createTool } from "@anvia/core";
import { USER_HANDLE } from "@aven/protocol/bots";
import { z } from "zod";

export const SEND_MESSAGE_TOOL_NAME = "send_message";

export const sendMessageSchema = z.object({
  to: z
    .string()
    .trim()
    .min(1)
    .default(USER_HANDLE)
    .describe(
      `Who gets it: "${USER_HANDLE}" for the person, which is the default, or the handle of another of their bots, from your list of bots.`,
    ),
  text: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe(
      "One message, as you would text it: short, one thought. Light markdown (bold, a short list) is shown as such; use it only when it helps.",
    ),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * What the host does with a message: shows it to the person, once it has been "typed", or hands it
 * to another bot; it says what became of it.
 */
export type SendMessage = (
  message: SendMessageInput,
  context: { abortSignal?: AbortSignal },
) => Promise<string>;

// The only way a bot speaks (decisions 0058 and 0065). What sending takes, such as the pause that
// makes a message to the person look typed, or finding the other bot, is the host's.
export function createSendMessageTool(send: SendMessage) {
  return createTool({
    name: SEND_MESSAGE_TOOL_NAME,
    description:
      "Send a message to the person or to one of their other bots. It is the only way anyone hears from you: nothing you write outside this tool is seen. Call it again for another message; they arrive in order, those to the person each after a short pause as if typed. A bot you write to answers in a message of its own, later, not as the result of this call.",
    inputSchema: sendMessageSchema,
    async execute(input, context) {
      return send(input, { abortSignal: context?.abortSignal });
    },
  });
}
