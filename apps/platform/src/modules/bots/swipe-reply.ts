import type { SwipeAxis, SwipeDirection } from "./types";

export const SWIPE_EDGE_GUARD_PX = 24;
export const SWIPE_MAX_OFFSET_PX = 68;
export const SWIPE_SNAP_PX = 48;
export const SWIPE_RESISTANCE = 0.65;

export function swipeDirection(mine: boolean): SwipeDirection {
  return mine ? "left" : "right";
}

export function canStartSwipe(direction: SwipeDirection, clientX: number): boolean {
  if (direction === "right" && clientX < SWIPE_EDGE_GUARD_PX) return false;

  return true;
}

export function resolveSwipeAxis(dx: number, dy: number, direction: SwipeDirection): SwipeAxis {
  if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return "vertical";

  const directionalDx = direction === "right" ? dx : -dx;

  if (directionalDx > 6 && Math.abs(dx) > Math.abs(dy)) return "horizontal";

  return "pending";
}

export function dampenedOffset(
  dx: number,
  direction: SwipeDirection,
): { offset: number; progress: number; ready: boolean } {
  const directionalDx = direction === "right" ? dx : -dx;

  if (directionalDx <= 0) return { offset: 0, progress: 0, ready: false };

  const distance = Math.min(SWIPE_MAX_OFFSET_PX, directionalDx * SWIPE_RESISTANCE);
  const offset = direction === "right" ? distance : -distance;

  return {
    offset,
    progress: Math.min(1, distance / SWIPE_SNAP_PX),
    ready: distance >= SWIPE_SNAP_PX,
  };
}

export function shouldTriggerReply(dx: number, direction: SwipeDirection): boolean {
  return dampenedOffset(dx, direction).ready;
}
