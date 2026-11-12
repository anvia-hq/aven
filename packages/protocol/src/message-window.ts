import { messageId } from "./events";
import type { ChatMessage, MessagesPage } from "./types";

export const MESSAGE_WINDOW = 100;

export const earlierMessageId = (index: number) => `e-${index}`;

function startOf(messages: readonly ChatMessage[], end: number, limit: number) {
  const first = Math.max(0, end - limit);

  if (first === 0) return 0;

  const boundary = messages.findIndex((message, at) => at >= first && message.role === "user");
  return boundary === -1 || boundary >= end ? first : boundary;
}

export function latestMessages(
  messages: readonly ChatMessage[],
  limit = MESSAGE_WINDOW,
): MessagesPage {
  const start = startOf(messages, messages.length, limit);
  return {
    messages: messages.slice(start).map((message, at) => ({ ...message, id: messageId(at) })),
    hidden: start,
  };
}

export function messagesBefore(
  messages: readonly ChatMessage[],
  before: number,
  limit = MESSAGE_WINDOW,
): MessagesPage {
  const end = Math.min(Math.max(before, 0), messages.length);
  const start = startOf(messages, end, limit);
  return {
    messages: messages
      .slice(start, end)
      .map((message, at) => ({ ...message, id: earlierMessageId(start + at) })),
    hidden: start,
  };
}
