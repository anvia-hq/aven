import type { Message } from "@anvia/core";
import {
  botMessageId,
  parseBotPrompt,
  type BotChatMessage,
  type BotChatPeer,
} from "@aven/protocol/bots";

import { MESSAGE_BOT_TOOL_NAME, messageBotSchema } from "./tools/message-bot";
import { SEND_MESSAGE_TOOL_NAME, sendMessageSchema } from "./tools/send-message";

const textOf = (content: Extract<Message, { role: "user" }>["content"]) =>
  typeof content === "string"
    ? content
    : content.map((part) => (part.type === "text" ? part.text : "")).join("");

type Answer = { bot?: string; replies: string[] };

// What each `message_bot` call of an assistant message was answered with, by the call's id, read
// from the tool results that follow it. A provider may reuse an id from one turn to the next, so the
// results are only read from the message right after the call.
function answersAfter(messages: readonly Message[], at: number) {
  const answers = new Map<string, Answer>();
  const results = messages[at + 1];
  if (results?.role !== "tool") return answers;
  for (const part of results.content) {
    if (part.type !== "tool-result" || part.toolName !== MESSAGE_BOT_TOOL_NAME) continue;
    if (part.output.type !== "json") continue;
    const { bot, replies } = part.output.value as { bot?: unknown; replies?: unknown };
    answers.set(part.toolCallId, {
      bot: typeof bot === "string" ? bot : undefined,
      replies: Array.isArray(replies) ? replies.filter((each) => typeof each === "string") : [],
    });
  }
  return answers;
}

// Rebuilds a bot's chat from its stored memory: what the person said, each message the bot sent
// with `send_message`, and, between bots (decision 0063), what another bot wrote to it, what it said
// back, and what the bot it wrote to answered. Whatever else the bot wrote or did is not part of
// the chat, nor is a note from the app.
export function botMessagesToChat(messages: readonly Message[]): BotChatMessage[] {
  const chat: BotChatMessage[] = [];
  // Who the bot's messages go to, while it answers a bot rather than the person.
  let replyingTo: BotChatPeer | undefined;
  const add = (role: BotChatMessage["role"], text: string, peer?: BotChatPeer) => {
    const message: BotChatMessage = { id: botMessageId(chat.length), role, text };
    if (peer) message.peer = peer;
    chat.push(message);
  };

  for (const [at, message] of messages.entries()) {
    if (message.role === "user") {
      const { from, note, text } = parseBotPrompt(textOf(message.content).trim());
      // What the app adds with no text, such as a screenshot, is not someone else speaking.
      if (text) replyingTo = from ? { name: from, direction: "to" } : undefined;
      if (note || !text) continue;
      add("user", text, from ? { name: from, direction: "from" } : undefined);
    } else if (message.role === "assistant" && typeof message.content !== "string") {
      const answers = answersAfter(messages, at);
      for (const part of message.content) {
        if (part.type !== "tool-call") continue;
        if (part.toolName === SEND_MESSAGE_TOOL_NAME) {
          const sent = sendMessageSchema.safeParse(part.input);
          if (sent.success) add("bot", sent.data.text, replyingTo);
        } else if (part.toolName === MESSAGE_BOT_TOOL_NAME) {
          const asked = messageBotSchema.safeParse(part.input);
          if (!asked.success) continue;
          const answer = answers.get(part.toolCallId);
          const name = answer?.bot ?? "a bot";
          add("bot", asked.data.text, { name, id: asked.data.bot, direction: "to" });
          for (const reply of answer?.replies ?? []) {
            add("user", reply, { name, id: asked.data.bot, direction: "from" });
          }
        }
      }
    }
  }
  return chat;
}
