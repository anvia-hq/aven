import { systemNoteOf } from "./system-notes";
import type { ChatMessage } from "./types";

const textOf = (message: ChatMessage) =>
  message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");

export function lastSubmission(messages: readonly ChatMessage[]) {
  return messages.findLast(
    (message) => message.role === "user" && systemNoteOf(textOf(message)) === null,
  );
}
