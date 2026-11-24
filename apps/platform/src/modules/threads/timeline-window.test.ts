import { describe, expect, test } from "bun:test";

import {
  LIVE_RECENT_TAIL,
  LIVE_TIMELINE_LIMIT,
  pushedTimelineItems,
  timelineWindow,
} from "./timeline-window";

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

describe("pushedTimelineItems", () => {
  const row = (id: string) => ({ id });

  test("pushes slot 2 out on the 4-to-5 transition so the parent claims slot 1 cleanly", () => {
    const step = pushedTimelineItems(
      [row("1"), row("2"), row("3"), row("4")],
      [row("3"), row("4"), row("5")],
    );
    expect(step.exiting.map((item) => item.id)).toEqual(["2"]);
    expect([...step.enteringIds]).toEqual(["5"]);
  });

  test("pushes the top recent row out on steady-state advances and caps batch shifts at 3", () => {
    const single = pushedTimelineItems(
      [row("3"), row("4"), row("5")],
      [row("4"), row("5"), row("6")],
    );
    expect(single.exiting.map((item) => item.id)).toEqual(["3"]);
    expect([...single.enteringIds]).toEqual(["6"]);

    const batch = pushedTimelineItems(
      [row("3"), row("4"), row("5")],
      [row("5"), row("6"), row("7")],
    );
    expect(batch.exiting.map((item) => item.id)).toEqual(["3", "4"]);
    expect([...batch.enteringIds]).toEqual(["6", "7"]);
  });

  test("returns nothing when recent item ids are unchanged", () => {
    const same = pushedTimelineItems(
      [row("4"), row("5"), row("6")],
      [row("4"), row("5"), row("6")],
    );
    expect(same.exiting).toEqual([]);
    expect([...same.enteringIds]).toEqual([]);
  });
});
