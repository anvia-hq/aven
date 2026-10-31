import type { Message } from "@anvia/core";
import { botMessageId, parseBotPrompt, type BotChatMessage } from "@aven/protocol/bots";

import { SEND_MESSAGE_TOOL_NAME, sendMessageSchema } from "./tools/send-message";

const textOf = (content: Extract<Message, { role: "user" }>["content"]) =>
  typeof content === "string"
    ? content
    : content.map((part) => (part.type === "text" ? part.text : "")).join("");

// Rebuilds a bot's chat from its stored memory: what the person said or another bot did, and each message the bot
// sent with `send_message`. Whatever else the bot wrote or did is not part of the chat.
export function botMessagesToChat(messages: readonly Message[]): BotChatMessage[] {
  const chat: BotChatMessage[] = [];
  const add = (role: BotChatMessage["role"], text: string, from?: string) =>
    chat.push(
      from
        ? { id: botMessageId(chat.length), role, text, from }
        : { id: botMessageId(chat.length), role, text },
    );

  for (const message of messages) {
    if (message.role === "user") {
      const prompt = textOf(message.content).trim();
      // A message another bot sent (decision 0063) is shown as that bot's, without its prefix.
      const { from, text } = parseBotPrompt(prompt);
      if (text) add("user", text, from);
    } else if (message.role === "assistant" && typeof message.content !== "string") {
      for (const part of message.content) {
        if (part.type !== "tool-call" || part.toolName !== SEND_MESSAGE_TOOL_NAME) continue;
        const sent = sendMessageSchema.safeParse(part.input);
        if (sent.success) add("bot", sent.data.text);
      }
    }
  }
  return chat;
}
