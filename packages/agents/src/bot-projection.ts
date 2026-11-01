import type { Message } from "@anvia/core";
import {
  botMessageId,
  parseBotPrompt,
  USER_HANDLE,
  type BotChatMessage,
} from "@aven/protocol/bots";

import { SEND_MESSAGE_TOOL_NAME, sendMessageSchema } from "./tools/send-message";

const textOf = (content: Extract<Message, { role: "user" }>["content"]) =>
  typeof content === "string"
    ? content
    : content.map((part) => (part.type === "text" ? part.text : "")).join("");

// The ids of the tool calls of an assistant message that failed, read from the tool results that
// follow it: a message that was refused (no such bot, too many in a row) was never sent. A provider
// may reuse an id from one turn to the next, so the results are read from the next message only.
function failedAfter(messages: readonly Message[], at: number) {
  const failed = new Set<string>();
  const results = messages[at + 1];
  if (results?.role !== "tool") return failed;
  for (const part of results.content) {
    if (part.type !== "tool-result") continue;
    if (part.output.type === "error-text" || part.output.type === "error-json") {
      failed.add(part.toolCallId);
    }
  }
  return failed;
}

// Rebuilds a bot's chat from its stored memory: what the person said, each message the bot sent
// with `send_message`, and, between bots (decision 0065), what another bot wrote to it and what it
// wrote to another, if it was sent. Whatever else the bot wrote or did is not part of the chat, nor is a note from
// the app. A bot is known by its handle here; the name is the platform's to find.
export function botMessagesToChat(messages: readonly Message[]): BotChatMessage[] {
  const chat: BotChatMessage[] = [];
  const add = (role: BotChatMessage["role"], text: string, peer?: BotChatMessage["peer"]) => {
    const message: BotChatMessage = { id: botMessageId(chat.length), role, text };
    if (peer) message.peer = peer;
    chat.push(message);
  };

  for (const [at, message] of messages.entries()) {
    if (message.role === "user") {
      const { from, note, text } = parseBotPrompt(textOf(message.content).trim());
      if (note || !text) continue;
      add("user", text, from ? { name: from, handle: from, direction: "from" } : undefined);
    } else if (message.role === "assistant" && typeof message.content !== "string") {
      const failed = failedAfter(messages, at);
      for (const part of message.content) {
        if (part.type !== "tool-call" || part.toolName !== SEND_MESSAGE_TOOL_NAME) continue;
        if (failed.has(part.toolCallId)) continue;
        const sent = sendMessageSchema.safeParse(part.input);
        if (!sent.success) continue;
        const { to, text } = sent.data;
        add(
          "bot",
          text,
          to === USER_HANDLE ? undefined : { name: to, handle: to, direction: "to" },
        );
      }
    }
  }
  return chat;
}
