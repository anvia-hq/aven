import { COMPACT_PROMPT, COMPACTED, NOTHING_TO_COMPACT } from "@aven/protocol/compaction";
import { systemNoteOf } from "@aven/protocol/system-notes";

import type { ChatMessage } from "./types";

const textOf = (message: ChatMessage) =>
  message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");

export const isProcessNote = (message: ChatMessage) =>
  message.role === "user" && systemNoteOf(textOf(message))?.kind === "process";

const addedUp = (first: number | undefined, second: number | undefined) =>
  first === undefined && second === undefined ? undefined : (first ?? 0) + (second ?? 0);

const compactionNote = (message: ChatMessage, line: string): ChatMessage => ({
  id: message.id,
  role: "user",
  parts: [{ type: "text", text: `[compaction] ${line}` }],
});

export function foldedCompactions(messages: ChatMessage[], running: boolean): ChatMessage[] {
  const folded: ChatMessage[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;

    if (message.role !== "user" || textOf(message).trim() !== COMPACT_PROMPT) {
      folded.push(message);
      continue;
    }

    const reply = messages[index + 1];
    const answer = reply?.role === "assistant" ? textOf(reply).trim() : "";

    if (answer === NOTHING_TO_COMPACT) {
      folded.push(compactionNote(message, "Nothing to compact"));
      index += 1;
    } else if (answer === COMPACTED) {
      folded.push(compactionNote(message, "Compacted"));
      index += 1;
    } else if (reply?.role === "assistant" && reply.parts.length > 0) {
      folded.push(compactionNote(message, "Compacted"));
    } else if (running) {
      folded.push(compactionNote(message, "Compacting…"));

      if (reply?.role === "assistant") index += 1;
    } else {
      folded.push(compactionNote(message, "Compaction did not finish"));

      if (reply?.role === "assistant") index += 1;
    }
  }

  return folded;
}

export function mergedRuns(source: ChatMessage[], running: boolean): ChatMessage[] {
  const messages = foldedCompactions(source, running);
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
