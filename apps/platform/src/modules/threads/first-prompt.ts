import type { OutgoingMessage, RunSelection } from "./types";

const waiting = new Map<string, { message: OutgoingMessage; selection: RunSelection }>();

export function handOverFirstPrompt(
  threadId: string,
  message: OutgoingMessage,
  selection: RunSelection,
) {
  waiting.set(threadId, { message, selection });
}

export function takeFirstPrompt(threadId: string) {
  const first = waiting.get(threadId);
  waiting.delete(threadId);
  return first;
}
