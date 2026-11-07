import type { Runtime, UpdateAsked } from "./types";

export const UPDATE_WAIT_MS = 5 * 60_000;

type Seen = Pick<Runtime, "online" | "build">;

export function isUpdating(asked: UpdateAsked | undefined, runtime: Seen, now: number) {
  if (!asked || now - asked.at > UPDATE_WAIT_MS) return false;
  return !runtime.online || runtime.build === asked.from;
}

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
