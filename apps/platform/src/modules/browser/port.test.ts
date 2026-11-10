import { describe, expect, test } from "bun:test";

import { parsePort } from "./port";

describe("parsePort", () => {
  test("reads a port, with or without a colon and spaces", () => {
    expect(parsePort("3000")).toBe(3000);
    expect(parsePort(" :5173 ")).toBe(5173);
    expect(parsePort("65535")).toBe(65535);
  });

  test("refuses what is not a port", () => {
    for (const text of ["", "0", "65536", "-1", "3000.5", "http://x", "abc", "1e3"]) {
      expect(parsePort(text)).toBeNull();
    }
  });
});
