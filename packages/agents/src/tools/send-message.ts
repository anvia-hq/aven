import { createTool } from "@anvia/core";
import { BOT_MESSAGE_ID, USER_HANDLE } from "@aven/protocol/bots";
import { MAX_ARTIFACTS_PER_CALL } from "@aven/protocol/events";
import { z } from "zod";
import type { SendMessage } from "./types";
import type { ToolArtifact } from "@aven/protocol/types";

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
      "One short chat bubble when writing to the person: one thought, usually 1 to 3 sentences, never multiple paragraphs, headings, or a wall of text. If you have another paragraph, point, list or follow-up question, make another send_message call instead of putting blank lines in one message. Light markdown (bold, a short list) is shown as such; use it only when it helps. Start each list item on its own line with a hyphen, never a bullet character. Write another bot as @Name and it is shown as that bot. When writing to another bot, one complete task in plain words is fine.",
    ),
  quote: z
    .string()
    .trim()
    .regex(BOT_MESSAGE_ID)
    .optional()
    .describe(
      "The id of a message to quote, such as `m-3`, when you answer that one: the person sees it above your message. Leave it out otherwise.",
    ),
  files: z
    .array(
      z.object({
        path: z.string().trim().min(1).describe("The file on your computer."),
        title: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .optional()
          .describe(
            "What the person sees it called. Use the same title again to send a new version of a file you sent before.",
          ),
      }),
    )
    .max(MAX_ARTIFACTS_PER_CALL)
    .optional()
    .describe(
      "Files from your computer to send with this message to the person, shown beside the text and opened in a panel: a PDF, markdown, CSV or text file up to 10 MiB, an image, a video, or one self-contained HTML page up to 2 MiB. You cannot attach a file in any other way; a path in your text is only text. Save the file first.",
    ),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export function createSendMessageTool(
  send: SendMessage,
  onArtifacts?: (artifacts: ToolArtifact[], text: string) => void,
) {
  return createTool({
    name: SEND_MESSAGE_TOOL_NAME,
    description:
      "Send one chat bubble to the person, or a message to one of their other bots. It is the only way anyone hears from you: nothing you write outside this tool is seen, so use it for every reply, even a greeting or one word. For the person, never send a long or multi-paragraph reply in one call: split it into separate short send_message calls (one thought per bubble, 1 to 3 sentences) in the order you want them read; they arrive in order, each after a short pause as if typed. A bot you write to answers in a message of its own, later, not as the result of this call. Quote the message you are answering by its id, and do not repeat what it said.",
    inputSchema: sendMessageSchema,
    async handler(input, context) {
      const result = await send(input, { abortSignal: context?.abortSignal });

      if (typeof result === "string") return result;

      const names = result.artifacts.map((item) => item.title ?? item.name).join(", ");
      const lines = [
        result.artifacts.length > 0
          ? `Sent to the person with ${result.artifacts.length} file(s): ${names}.`
          : result.sent,
      ];
      for (const failure of result.failed) lines.push(`Failed (${failure.path}): ${failure.error}`);
      const text = lines.join("\n");

      if (result.artifacts.length > 0) onArtifacts?.(result.artifacts, text);

      return text;
    },
  });
}
