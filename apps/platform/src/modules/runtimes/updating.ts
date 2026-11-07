import type { Runtime } from "./types";

/** A runner asked to update: the release it was on and when it was asked (decision 0146). */
export type UpdateAsked = { from: string | null; at: number };

/** How long a runner is shown as updating before the row goes back to what it says. */
export const UPDATE_WAIT_MS = 5 * 60_000;

type Seen = Pick<Runtime, "online" | "build">;

/** Asked to update and not yet back on another release, within the wait. */
export function isUpdating(asked: UpdateAsked | undefined, runtime: Seen, now: number) {
  if (!asked || now - asked.at > UPDATE_WAIT_MS) return false;
  return !runtime.online || runtime.build === asked.from;
}

/**
 * How an update ended, or null while it goes on: "done" once the runner is back on another
 * release, "failed" when the wait is over and it is online on the release it began on.
 */
export function updateEnd(
  asked: UpdateAsked | undefined,
  runtime: Seen,
  now: number,
): "done" | "failed" | null {
  if (!asked) return null;
  if (runtime.online && runtime.build !== asked.from) return "done";
  if (now - asked.at > UPDATE_WAIT_MS) return runtime.online ? "failed" : null;
  return null;
}
