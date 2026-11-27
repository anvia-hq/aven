import { useCallback, useRef, useState, type PointerEvent } from "react";

import {
  canStartSwipe,
  dampenedOffset,
  resolveSwipeAxis,
  shouldTriggerReply,
  swipeDirection,
} from "../swipe-reply";
import type { SwipeAxis, SwipeState } from "../types";

const IDLE: SwipeState = { offset: 0, progress: 0, ready: false, dragging: false };

export function useSwipeReply({ mine, onReply }: { mine: boolean; onReply: () => void }) {
  const direction = swipeDirection(mine);
  const [state, setState] = useState<SwipeState>(IDLE);
  const gesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    axis: SwipeAxis;
  } | null>(null);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") return;

      if (event.target instanceof Element && event.target.closest("button, a")) return;

      if (!canStartSwipe(direction, event.clientX)) return;

      gesture.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        axis: "pending",
      };
    },
    [direction],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const active = gesture.current;

      if (!active || active.pointerId !== event.pointerId) return;

      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;

      if (active.axis === "pending") {
        const nextAxis = resolveSwipeAxis(dx, dy, direction);

        if (nextAxis === "vertical") {
          gesture.current = null;
          setState(IDLE);
          return;
        }

        if (nextAxis === "horizontal") {
          active.axis = "horizontal";
        }
      }

      if (active.axis !== "horizontal") return;

      const next = dampenedOffset(dx, direction);
      setState({ ...next, dragging: true });
    },
    [direction],
  );

  const finish = useCallback(
    (event: PointerEvent<HTMLElement>, allowTrigger: boolean) => {
      const active = gesture.current;

      if (!active || active.pointerId !== event.pointerId) return;

      const dx = event.clientX - active.startX;
      const triggered =
        allowTrigger && active.axis === "horizontal" && shouldTriggerReply(dx, direction);

      gesture.current = null;
      setState(IDLE);

      if (triggered) onReply();
    },
    [direction, onReply],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => finish(event, true),
    [finish],
  );

  const onPointerCancel = useCallback(
    (event: PointerEvent<HTMLElement>) => finish(event, false),
    [finish],
  );

  return {
    direction,
    state,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
