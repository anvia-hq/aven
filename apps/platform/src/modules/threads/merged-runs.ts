import { systemNoteOf } from "@aven/protocol/system-notes";

import type { ChatMessage } from "./types";

const textOf = (message: ChatMessage) =>
  message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");

export const isProcessNote = (message: ChatMessage) =>
  message.role === "user" && systemNoteOf(textOf(message))?.kind === "process";

const addedUp = (first: number | undefined, second: number | undefined) =>
  first === undefined && second === undefined ? undefined : (first ?? 0) + (second ?? 0);

export function mergedRuns(messages: ChatMessage[], running: boolean): ChatMessage[] {
  const merged: ChatMessage[] = [];
  let notes = 0;
  messages.forEach((message, index) => {
    if (isProcessNote(message)) {
      merged.push(message);
      notes += 1;
      return;
    }
    const live = running && index === messages.length - 1;
    const previous = merged[merged.length - 1 - notes];
    if (message.role === "assistant" && previous?.role === "assistant" && !live) {
      merged.splice(merged.length - notes, notes);
      merged[merged.length - 1] = {
        ...previous,
        parts: [...previous.parts, ...message.parts],
        workedMs: addedUp(previous.workedMs, message.workedMs),
      };
    } else {
      merged.push(message);
    }
    notes = 0;
  });
  return merged;
}
