import type { Thread, ThreadStatus } from "./types";

export function threadStatus(
  thread: Pick<Thread, "id" | "awaitingAnswer" | "lastError">,
  signals: { mentioned: ReadonlySet<string>; unread: ReadonlySet<string> },
): ThreadStatus | null {
  if (thread.awaitingAnswer || thread.lastError || signals.mentioned.has(thread.id))
    return "attention";

  return signals.unread.has(thread.id) ? "finished" : null;
}

export function statusOfPair(left: ThreadStatus | null, right: ThreadStatus | null) {
  if (left === "attention" || right === "attention") return "attention";

  return left === "finished" || right === "finished" ? "finished" : null;
}
