import { describe, expect, test } from "bun:test";

import { LIVE_TIMELINE_WINDOW, timelineWindow } from "./timeline-window";

describe("timelineWindow", () => {
  test("returns all items when not windowed or within the live window", () => {
    const few = ["a", "b", "c", "d"];
    expect(timelineWindow(few, true)).toEqual({ items: few, visibleFrom: 0 });

    const many = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    expect(timelineWindow(many, false)).toEqual({ items: many, visibleFrom: 0 });
  });

  test("keeps the latest live rows visible and retains a small exiting buffer for older rows", () => {
    const five = ["1", "2", "3", "4", "5"];
    const stepFive = timelineWindow(five, true);
    expect(stepFive.items).toEqual(["1", "2", "3", "4", "5"]);
    expect(stepFive.items.slice(stepFive.visibleFrom)).toEqual(["2", "3", "4", "5"]);

    const ten = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    const stepTen = timelineWindow(ten, true);
    expect(stepTen.items.slice(stepTen.visibleFrom)).toEqual(["7", "8", "9", "10"]);
    expect(stepTen.items.slice(stepTen.visibleFrom)).toHaveLength(LIVE_TIMELINE_WINDOW);
    expect(stepTen.visibleFrom).toBeGreaterThan(0);
    expect(stepTen.items.length).toBeLessThan(ten.length);
  });
});
