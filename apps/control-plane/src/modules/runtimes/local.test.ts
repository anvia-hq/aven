import { describe, expect, test } from "bun:test";

import { localRunnerMode } from "./local";
import { localRunnerToken } from "./service";

describe("localRunnerMode", () => {
  test("is on when unset and reads the three modes", () => {
    expect(localRunnerMode(undefined)).toBe("on");
    expect(localRunnerMode("")).toBe("on");
    for (const mode of ["on", "off", "host"] as const) expect(localRunnerMode(mode)).toBe(mode);
  });

  test("refuses anything else instead of reading it as on", () => {
    expect(() => localRunnerMode("false")).toThrow("AVEN_LOCAL_RUNNER must be one of");
  });
});

describe("localRunnerToken", () => {
  test("makes a different one per process when none is configured", () => {
    const [a, b] = [localRunnerToken(undefined), localRunnerToken("")];
    expect(a).toStartWith("avrt_local_");
    expect(a).not.toBe(b);
  });

  test("keeps a configured one", () => {
    const token = `avrt_${"a".repeat(48)}`;
    expect(localRunnerToken(token)).toBe(token);
  });

  test("refuses one that could not authenticate or is short enough to guess", () => {
    expect(() => localRunnerToken("secret".repeat(10))).toThrow("must start with avrt_");
    expect(() => localRunnerToken("avrt_short")).toThrow("at least 32 characters");
  });
});
