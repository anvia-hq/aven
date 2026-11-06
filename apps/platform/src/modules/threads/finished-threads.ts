import type { Thread } from "./types";

/**
 * The threads that were running in `before` and are not any more in `after`: their agent has just
 * finished (or stopped to ask something), which is when a person who looked away is told.
 * A thread that was not in `before` is not one: a list just loaded has nothing to compare with.
 */
export function finishedThreads(before: Map<string, boolean>, after: Thread[]) {
  return after.filter((thread) => before.get(thread.id) === true && !thread.running);
}
