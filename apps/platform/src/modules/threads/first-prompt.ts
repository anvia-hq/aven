import type { OutgoingMessage, RunSelection } from "./types";

// The first message of a thread that was just made, handed from the screen that made it to the
// thread's own, which sends it and shows it at once (decision 0126). Kept here, in memory, since it
// belongs to this browser and this one navigation.
const waiting = new Map<string, { message: OutgoingMessage; selection: RunSelection }>();

/** Leaves the thread's first message for its page to send. */
export function handOverFirstPrompt(
  threadId: string,
  message: OutgoingMessage,
  selection: RunSelection,
) {
  waiting.set(threadId, { message, selection });
}

/** Takes the thread's first message, once: a second ask finds nothing. */
export function takeFirstPrompt(threadId: string) {
  const first = waiting.get(threadId);
  waiting.delete(threadId);
  return first;
}
