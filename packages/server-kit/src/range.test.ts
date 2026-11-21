import { describe, expect, test } from "bun:test";

import { byteRange } from "./range";

describe("byteRange", () => {
  test("reads a start and an end, an open end and the last bytes", () => {
    expect(byteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(byteRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(byteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(byteRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });

  test("keeps an end past the file to the file", () => {
    expect(byteRange("bytes=990-5000", 1000)).toEqual({ start: 990, end: 999 });
  });

  test("answers with the whole file when there is no single range to give", () => {
    expect(byteRange(null, 1000)).toBeNull();
    expect(byteRange("bytes=0-1,5-9", 1000)).toBeNull();
    expect(byteRange("items=0-1", 1000)).toBeNull();
    expect(byteRange("bytes=-", 1000)).toBeNull();
  });

  test("refuses a range outside the file", () => {
    expect(byteRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(byteRange("bytes=50-10", 1000)).toBe("unsatisfiable");
    expect(byteRange("bytes=-0", 1000)).toBe("unsatisfiable");
  });
});
