import { describe, expect, test } from "bun:test";

import { addressOf, parsePort } from "./port";

describe("parsePort", () => {
  test("reads a port, with or without a colon and spaces", () => {
    expect(parsePort("3000")).toBe(3000);
    expect(parsePort(" :5173 ")).toBe(5173);
    expect(parsePort("65535")).toBe(65535);
  });

  test("reads the address of a local page", () => {
    expect(parsePort("localhost:3000")).toBe(3000);
    expect(parsePort("http://localhost:5173/")).toBe(5173);
    expect(parsePort("https://127.0.0.1:8080")).toBe(8080);
    expect(parsePort("0.0.0.0:4000")).toBe(4000);
    expect(parsePort(addressOf(3000))).toBe(3000);
  });

  test("refuses an address on another host", () => {
    for (const text of ["example.com:3000", "http://10.0.0.5:3000", "http://evil.test"]) {
      expect(parsePort(text)).toBeNull();
    }
  });

  test("reads and formats a preview tunnel URL when previewDomain is set", () => {
    const target = {
      runtimeId: "00000000-0000-4000-8000-000000000001",
      previewDomain: "aven.run",
    };
    const url = addressOf(5173, target);
    expect(url).toBe("https://5173-00000000-0000-4000-8000-000000000001.aven.run");
    expect(parsePort(url, target)).toBe(5173);
    expect(parsePort(`${url}/login?next=/`, target)).toBe(5173);
    expect(parsePort("5173-00000000-0000-4000-8000-000000000002.aven.run", target)).toBeNull();
    expect(
      parsePort("https://5173-00000000-0000-4000-8000-000000000001.evil.test", target),
    ).toBeNull();
  });

  test("refuses what is not a port", () => {
    for (const text of ["", "0", "65536", "-1", "3000.5", "http://x", "localhost", "abc", "1e3"]) {
      expect(parsePort(text)).toBeNull();
    }
  });
});
