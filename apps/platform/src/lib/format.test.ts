import { describe, expect, test } from "bun:test";

import { elapsed } from "./format";

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
