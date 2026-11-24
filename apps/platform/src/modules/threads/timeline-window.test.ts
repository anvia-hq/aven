import { describe, expect, test } from "bun:test";

import { LIVE_RECENT_TAIL, LIVE_TIMELINE_LIMIT, timelineWindow } from "./timeline-window";

describe("timelineWindow", () => {
  test("returns all items directly when not windowed or within the live limit", () => {
    const few = ["a", "b", "c", "d"];
    expect(few).toHaveLength(LIVE_TIMELINE_LIMIT);
    expect(timelineWindow(few, true)).toEqual({ older: [], recent: few });

    const many = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    expect(timelineWindow(many, false)).toEqual({ older: [], recent: many });
  });

  test("folds older items under a parent while keeping a steady tail of recent rows", () => {
    const five = ["1", "2", "3", "4", "5"];
    expect(timelineWindow(five, true)).toEqual({
      older: ["1", "2"],
      recent: ["3", "4", "5"],
    });

    const ten = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    const stepTen = timelineWindow(ten, true);
    expect(stepTen.older).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(stepTen.recent).toEqual(["8", "9", "10"]);
    expect(stepTen.recent).toHaveLength(LIVE_RECENT_TAIL);
  });
});
