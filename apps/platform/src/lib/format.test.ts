import { describe, expect, test } from "bun:test";

import { elapsed, resetsIn, shortTimeAgo, storageSize, storageUsage } from "./format";

describe("elapsed", () => {
  test("is seconds under a minute", () => {
    expect(elapsed(0)).toBe("0s");
    expect(elapsed(999)).toBe("0s");
    expect(elapsed(12_000)).toBe("12s");
    expect(elapsed(59_999)).toBe("59s");
  });

  test("is minutes and seconds under an hour", () => {
    expect(elapsed(60_000)).toBe("1m 0s");
    expect(elapsed(272_000)).toBe("4m 32s");
    expect(elapsed(3_599_000)).toBe("59m 59s");
  });

  test("is hours and minutes from an hour", () => {
    expect(elapsed(3_600_000)).toBe("1h 0m");
    expect(elapsed(3_900_000)).toBe("1h 5m");
    expect(elapsed(26 * 3_600_000 + 2 * 60_000)).toBe("26h 2m");
  });

  test("is never negative", () => {
    expect(elapsed(-5000)).toBe("0s");
  });
});

describe("storageSize", () => {
  test("is gigabytes from a gigabyte and terabytes from a terabyte, smaller sizes as a file's", () => {
    expect(storageSize(512)).toBe("512 B");
    expect(storageSize(5 * 1024 ** 2)).toBe("5.0 MB");
    expect(storageSize(5.5 * 1024 ** 3)).toBe("5.5 GB");
    expect(storageSize(1024 ** 4)).toBe("1.0 TB");
    expect(storageSize(1024 ** 4 - 1024 ** 2)).toBe("1.0 TB");
  });
});

describe("storageUsage", () => {
  test("says used and total once, in the total's unit", () => {
    expect(storageUsage(6.4 * 1024 ** 3, 15.6 * 1024 ** 3)).toBe("6.4 of 15.6 GB");
    expect(storageUsage(1.5 * 1024 ** 4, 2 * 1024 ** 4)).toBe("1.5 of 2.0 TB");
    expect(storageUsage(200, 1000)).toBe("200 B of 1000 B");
  });
});

describe("shortTimeAgo", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  const ago = (ms: number) => shortTimeAgo(new Date(now - ms).toISOString(), now);
  const MIN = 60_000;
  const DAY = 24 * 60 * MIN;

  test("says the largest unit that fits, in a few letters", () => {
    expect(ago(30_000)).toBe("now");
    expect(ago(5 * MIN)).toBe("5m");
    expect(ago(3 * 60 * MIN)).toBe("3h");
    expect(ago(2 * DAY)).toBe("2d");
    expect(ago(15 * DAY)).toBe("2w");
    expect(ago(65 * DAY)).toBe("2mo");
    expect(ago(400 * DAY)).toBe("1y");
  });

  test("is now for a time a little ahead of the clock", () => {
    expect(ago(-5_000)).toBe("now");
  });
});

describe("resetsIn", () => {
  test("reads minutes, hours with minutes, and days with hours", () => {
    expect(resetsIn(30_000, 0)).toBe("less than a minute");
    expect(resetsIn(25 * 60_000, 0)).toBe("25m");
    expect(resetsIn((2 * 60 + 10) * 60_000, 0)).toBe("2h 10m");
    expect(resetsIn((3 * 24 + 5) * 3_600_000, 0)).toBe("3d 5h");
    expect(resetsIn(0, 1000)).toBe("less than a minute");
  });
});
