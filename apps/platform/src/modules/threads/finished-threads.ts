import type { Thread } from "./types";

export function finishedThreads(before: Map<string, boolean>, after: Thread[]) {
  return after.filter((thread) => before.get(thread.id) === true && !thread.running);
}
