import { describe, expect, test } from "bun:test";

import { CronError, minimumGapMinutes, nextRun, parseCron } from "./cron";

const at = (text: string) => new Date(text);
const iso = (date: Date | null) => date?.toISOString();

describe("nextRun", () => {
  test("finds the next daily time in the given timezone", () => {
    expect(iso(nextRun("0 7 * * *", "Asia/Jakarta", at("2026-10-18T10:00:00Z")))).toBe(
      "2026-10-19T00:00:00.000Z",
    );
    expect(iso(nextRun("0 7 * * *", "Asia/Jakarta", at("2026-10-18T22:59:00Z")))).toBe(
      "2026-10-19T00:00:00.000Z",
    );
    expect(iso(nextRun("0 7 * * *", "Asia/Jakarta", at("2026-10-19T00:00:00Z")))).toBe(
      "2026-10-20T00:00:00.000Z",
    );
  });

  test("does not depend on the machine's timezone", () => {
    expect(iso(nextRun("30 9 * * *", "UTC", at("2026-01-01T00:00:00Z")))).toBe(
      "2026-01-01T09:30:00.000Z",
    );
  });

  test("keeps the local hour across a daylight saving change", () => {
    expect(iso(nextRun("0 7 * * *", "America/New_York", at("2026-03-07T13:00:00Z")))).toBe(
      "2026-03-08T11:00:00.000Z",
    );
    expect(iso(nextRun("0 7 * * *", "America/New_York", at("2026-03-08T12:00:00Z")))).toBe(
      "2026-03-09T11:00:00.000Z",
    );
  });

  test("runs a time skipped by a daylight saving jump just after it", () => {
    expect(iso(nextRun("30 2 * * *", "America/New_York", at("2026-03-08T00:00:00Z")))).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });

  test("supports lists, ranges, steps and names", () => {
    expect(iso(nextRun("*/20 9-10 * * mon-fri", "UTC", at("2026-10-16T10:41:00Z")))).toBe(
      "2026-10-19T09:00:00.000Z",
    );
    expect(iso(nextRun("0 8 1,15 jan,jul *", "UTC", at("2026-02-01T00:00:00Z")))).toBe(
      "2026-07-01T08:00:00.000Z",
    );
    expect(iso(nextRun("@hourly", "UTC", at("2026-10-18T10:15:00Z")))).toBe(
      "2026-10-18T11:00:00.000Z",
    );
  });

  test("treats day-of-month and day-of-week as either when both are set", () => {
    expect(iso(nextRun("0 0 13 * fri", "UTC", at("2026-10-14T00:00:00Z")))).toBe(
      "2026-10-16T00:00:00.000Z",
    );
  });

  test("accepts 7 as Sunday and returns null for dates that never happen", () => {
    expect(iso(nextRun("0 0 * * 7", "UTC", at("2026-10-18T10:00:00Z")))).toBe(
      "2026-10-25T00:00:00.000Z",
    );
    expect(nextRun("0 0 31 2 *", "UTC", at("2026-10-18T10:00:00Z"))).toBeNull();
  });
});

describe("parseCron", () => {
  test.each(["", "* * * *", "* * * * * *", "60 * * * *", "* 24 * * *"])(
    "rejects %p",
    (expression) => {
      expect(() => parseCron(expression)).toThrow(CronError);
    },
  );

  test.each(["*/0 * * * *", "5-1 * * * *", "a * * * *", "1,,2 * * * *"])(
    "rejects malformed field %p",
    (expression) => {
      expect(() => parseCron(expression)).toThrow(CronError);
    },
  );

  test("rejects an unknown timezone", () => {
    expect(() => nextRun("0 7 * * *", "Mars/Base", new Date())).toThrow(CronError);
  });
});

describe("minimumGapMinutes", () => {
  test("is the closest two times of a day can be, whatever day it starts from", () => {
    expect(minimumGapMinutes("*/15 * * * *")).toBe(15);
    expect(minimumGapMinutes("*/5 * * * *")).toBe(5);
    expect(minimumGapMinutes("0,30,40 * * * *")).toBe(10);
    expect(minimumGapMinutes("0,10,30 7 * * *")).toBe(10);
    expect(minimumGapMinutes("0 7 * * *")).toBe(24 * 60);
    expect(minimumGapMinutes("0 7,8 * * *")).toBe(60);
  });

  test("counts from the end of one day to the start of the next", () => {
    expect(minimumGapMinutes("55 23 * * *")).toBe(24 * 60);
    expect(minimumGapMinutes("0,55 0,23 * * *")).toBe(5);
  });
});
