import { describe, expect, test } from "bun:test";

import { elapsed, storageSize, storageUsage } from "./format";

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
    // Just under a terabyte rounds up to one, rather than reading "1024.0 GB".
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
