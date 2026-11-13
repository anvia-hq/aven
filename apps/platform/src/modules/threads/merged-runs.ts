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

type Neighbours = { before?: ChatMessage; after?: ChatMessage };

const isCompactRequest = (message: ChatMessage | undefined) =>
  message?.role === "user" && textOf(message).trim() === COMPACT_PROMPT;

const isUsualReply = (message: ChatMessage) => {
  const answer = textOf(message).trim();

  return answer === COMPACTED || answer === NOTHING_TO_COMPACT;
};

export function foldedCompactions(
  messages: ChatMessage[],
  running: boolean,
  neighbours: Neighbours = {},
): ChatMessage[] {
  const folded: ChatMessage[] = [];
  const last = messages.length - 1;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;

    if (
      index === 0 &&
      isCompactRequest(neighbours.before) &&
      message.role === "assistant" &&
      isUsualReply(message)
    ) {
      continue;
    }

    if (!isCompactRequest(message)) {
      folded.push(message);
      continue;
    }

    const reply = messages[index + 1] ?? neighbours.after;
    const own = index + 1 <= last;
    const answer = reply?.role === "assistant" ? textOf(reply).trim() : "";
    const latest = index === last || (own && index + 1 === last);

    if (answer === NOTHING_TO_COMPACT) {
      folded.push(compactionNote(message, "Nothing to compact"));

      if (own) index += 1;
    } else if (answer === COMPACTED) {
      folded.push(compactionNote(message, "Compacted"));

      if (own) index += 1;
    } else if (reply?.role === "assistant" && reply.parts.length > 0) {
      folded.push(compactionNote(message, "Compacted"));
    } else if (running && latest) {
      folded.push(compactionNote(message, "Compacting…"));

      if (own && reply?.role === "assistant") index += 1;
    } else {
      folded.push(compactionNote(message, "Compaction did not finish"));

      if (own && reply?.role === "assistant") index += 1;
    }
  }

  return folded;
}

export function mergedRuns(
  source: ChatMessage[],
  running: boolean,
  neighbours: Neighbours = {},
): ChatMessage[] {
  const messages = foldedCompactions(source, running, neighbours);
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
