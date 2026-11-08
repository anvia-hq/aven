import { describe, expect, test } from "bun:test";

import {
  areaPath,
  chartDate,
  dayOf,
  handleOf,
  heatmapWeeks,
  levelOf,
  linePath,
  pointsOf,
  seriesOf,
  spanLabel,
  startOf,
} from "./activity";

const day = (date: string, tokens = 0) => ({ date, tokens });

describe("spanLabel", () => {
  test("reads a while as minutes, hours or days and hours", () => {
    expect(spanLabel(0)).toBe("—");
    expect(spanLabel(45_000)).toBe("1m");
    expect(spanLabel(42 * 60_000)).toBe("42m");
    expect(spanLabel(5.7 * 3_600_000)).toBe("5.7h");
    expect(spanLabel(3 * 24 * 3_600_000)).toBe("3d");
    expect(spanLabel(3 * 24 * 3_600_000 + 4 * 3_600_000)).toBe("3d 4h");
  });
});

describe("handleOf", () => {
  test("is the name without its spacing, and the email when the name has no letters", () => {
    expect(handleOf("Ada Lovelace", "ada@aven.test")).toBe("adalovelace");
    expect(handleOf("  ***  ", "captain@aven.test")).toBe("captain");
  });
});

describe("seriesOf", () => {
  test("gives a value for every day from the first day with activity, oldest first, ending today", () => {
    const series = seriesOf([day("2026-03-01", 10), day("2026-03-03", 30)], "2026-03-04", 6);
    expect(series.dates).toEqual(["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04"]);
    expect(series.values).toEqual([10, 0, 30, 0]);
  });

  test("starts at the window when the first day with activity is older", () => {
    expect(seriesOf([day("2026-02-01", 5)], "2026-03-04", 6).dates[0]).toBe("2026-02-27");
    expect(seriesOf([day("2026-02-01", 5)], "2026-03-04", 6).dates).toHaveLength(6);
  });
});

describe("heatmapWeeks", () => {
  const weeks = heatmapWeeks([day("2026-03-03", 7)], "2026-03-04", 4);

  test("ends with the week that holds today, Sunday first", () => {
    expect(weeks).toHaveLength(4);
    const last = weeks.at(-1)!;
    expect(last.cells[0]?.date).toBe("2026-03-01");
    expect(last.cells[3]?.date).toBe("2026-03-04");
    expect(last.cells.slice(4)).toEqual([null, null, null]);
  });

  test("names a month on the first week that has it", () => {
    expect(weeks.map((week) => week.label)).toEqual(["Feb", null, null, "Mar"]);
  });

  test("keeps the tokens of a day, and none for a day without any", () => {
    expect(weeks.at(-1)!.cells[2]).toEqual({ date: "2026-03-03", tokens: 7 });
    expect(weeks.at(-1)!.cells[1]).toEqual({ date: "2026-03-02", tokens: 0 });
  });
});

describe("levelOf", () => {
  test("spreads days over five steps by the busiest day", () => {
    expect([0, 1, 30, 60, 90].map((tokens) => levelOf(tokens, 100))).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("pointsOf, linePath and areaPath", () => {
  const points = pointsOf([0, 10], 100, 50);

  test("puts the busiest day at the top and the others along the width", () => {
    expect(points).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 0 },
    ]);
  });

  test("draws the line and closes it down to the floor", () => {
    expect(linePath(points)).toBe("M0 50 L100 0");
    expect(areaPath(points, 50)).toBe("M0 50 L100 0 L100 50 L0 50 Z");
    expect(areaPath([], 50)).toBe("");
  });

  test("a single day sits in the middle", () => {
    expect(pointsOf([4], 100, 50)).toEqual([{ x: 50, y: 0 }]);
  });
});

describe("chartDate and dayOf", () => {
  test("read a date as a person would", () => {
    expect(chartDate("2026-07-16")).toBe("Jul 16");
    expect(dayOf(startOf("2026-07-16"))).toBe("2026-07-16");
  });
});
