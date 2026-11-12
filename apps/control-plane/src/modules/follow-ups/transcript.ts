import type { ChatMessage } from "@aven/protocol/types";

import { spoken } from "../threads/addressing";

const MESSAGES = 4;
const USER_CHARACTERS = 600;
const AGENT_CHARACTERS = 2500;

const textOf = (message: ChatMessage) =>
  message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("")
    .trim();

export const agentReply = (messages: readonly ChatMessage[]) => {
  const last = messages.at(-1);

  return last?.role === "assistant" ? textOf(last) : "";
};

export function followUpTranscript(messages: readonly ChatMessage[]) {
  const last = messages.at(-1);

  if (last?.role !== "assistant" || textOf(last) === "") return undefined;

  return messages
    .slice(-MESSAGES)
    .flatMap((message) => {
      const text = textOf(message);

      if (text === "") return [];

      return message.role === "user"
        ? [`User: ${spoken(text).slice(0, USER_CHARACTERS)}`]
        : [`Agent: ${text.slice(-AGENT_CHARACTERS)}`];
    })
    .join("\n\n");
}
