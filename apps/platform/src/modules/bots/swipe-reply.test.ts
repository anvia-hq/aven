import { describe, expect, test } from "bun:test";

import {
  canStartSwipe,
  dampenedOffset,
  resolveSwipeAxis,
  shouldTriggerReply,
  swipeDirection,
} from "./swipe-reply";

describe("inward swipe-to-reply geometry", () => {
  test("swipes bot bubbles right and user bubbles left", () => {
    expect(swipeDirection(false)).toBe("right");
    expect(swipeDirection(true)).toBe("left");
  });

  test("guards the left edge for right-swiped bot bubbles so browser back-swipe works", () => {
    expect(canStartSwipe("right", 12)).toBe(false);
    expect(canStartSwipe("right", 24)).toBe(true);
    expect(canStartSwipe("left", 12)).toBe(true);
  });

  test("locks vertical when vertical scroll leads, and horizontal only in the inward direction", () => {
    expect(resolveSwipeAxis(3, 14, "right")).toBe("vertical");
    expect(resolveSwipeAxis(12, 2, "right")).toBe("horizontal");
    expect(resolveSwipeAxis(-12, 2, "right")).toBe("pending");
    expect(resolveSwipeAxis(-12, 2, "left")).toBe("horizontal");
    expect(resolveSwipeAxis(12, 2, "left")).toBe("pending");
  });

  test("dampens and caps horizontal offset and marks ready at 48px", () => {
    expect(dampenedOffset(-20, "right")).toEqual({ offset: 0, progress: 0, ready: false });
    expect(dampenedOffset(20, "right")).toEqual({
      offset: 13,
      progress: 13 / 48,
      ready: false,
    });
    expect(dampenedOffset(80, "right")).toEqual({
      offset: 52,
      progress: 1,
      ready: true,
    });
    expect(dampenedOffset(200, "right").offset).toBe(68);
    expect(dampenedOffset(-200, "left").offset).toBe(-68);
  });

  test("triggers reply only when released past the snap threshold", () => {
    expect(shouldTriggerReply(60, "right")).toBe(false);
    expect(shouldTriggerReply(74, "right")).toBe(true);
    expect(shouldTriggerReply(-74, "left")).toBe(true);
    expect(shouldTriggerReply(74, "left")).toBe(false);
  });
});
