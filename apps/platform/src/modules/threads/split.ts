import type { DragEvent } from "react";

import type { SplitPair, SplitSide } from "./types";

export const THREAD_DRAG = "application/x-aven-thread";

export const dragThread = (event: DragEvent, id: string) => {
  event.dataTransfer.setData(THREAD_DRAG, id);
  event.dataTransfer.effectAllowed = "move";
};

export const dragsThread = (event: DragEvent) => event.dataTransfer.types.includes(THREAD_DRAG);

export const sideOf = (x: number, left: number, width: number): SplitSide =>
  x - left < width / 2 ? "left" : "right";

export function splitWith(
  dropped: string,
  side: SplitSide,
  threadId: string,
  split: string | undefined,
): { threadId: string; split: string } | undefined {
  const other = split ?? threadId;
  if (side === "left") {
    if (dropped === threadId && split === undefined) return undefined;
    return dropped === other
      ? { threadId: other, split: threadId }
      : { threadId: dropped, split: other };
  }
  if (dropped === threadId) {
    return split === undefined ? undefined : { threadId: split, split: threadId };
  }
  return { threadId, split: dropped };
}

export const withPair = (pairs: SplitPair[], left: string, right: string): SplitPair[] => [
  ...pairs.filter((pair) => !pair.includes(left) && !pair.includes(right)),
  [left, right],
];

export const withoutPair = (pairs: SplitPair[], id: string): SplitPair[] =>
  pairs.filter((pair) => !pair.includes(id));

export const partnerOf = (pairs: SplitPair[], id: string) => {
  const pair = pairs.find((each) => each.includes(id));
  return pair?.find((each) => each !== id);
};
