import type { Message } from "@anvia/core";
import { botMessageId, type BotChatMessage } from "@aven/protocol/bots";

import { SEND_MESSAGE_TOOL_NAME, sendMessageSchema } from "./tools/send-message";

const textOf = (content: Extract<Message, { role: "user" }>["content"]) =>
  typeof content === "string"
    ? content
    : content.map((part) => (part.type === "text" ? part.text : "")).join("");

// Rebuilds a bot's chat from its stored memory: what the person said, and each message the bot
// sent with `send_message`. Whatever else the bot wrote or did is not part of the chat.
export function botMessagesToChat(messages: readonly Message[]): BotChatMessage[] {
  const chat: BotChatMessage[] = [];
  const add = (role: BotChatMessage["role"], text: string) =>
    chat.push({ id: botMessageId(chat.length), role, text });

  for (const message of messages) {
    if (message.role === "user") {
      const text = textOf(message.content).trim();
      if (text) add("user", text);
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
