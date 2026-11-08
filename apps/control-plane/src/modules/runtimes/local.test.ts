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
  test("keeps a configured one as it is, whatever the built-in runner is set to", () => {
    const token = `avrt_${"a".repeat(48)}`;
    for (const mode of ["on", "host", "off", undefined])
      expect(localRunnerToken(token, mode)).toBe(token);
  });

  test("refuses to make one up while the built-in runner is on", () => {
    for (const mode of ["on", "host", undefined])
      expect(() => localRunnerToken(undefined, mode)).toThrow(
        "AVEN_LOCAL_RUNNER_TOKEN is required while the built-in runner is on",
      );
    expect(() => localRunnerToken("", "on")).toThrow("AVEN_LOCAL_RUNNER_TOKEN is required");
  });

  test("says how to make the token it asks for", () => {
    const missing = () => localRunnerToken(undefined, "on");
    expect(missing).toThrow("avrt_ prefix and at least 32 characters");
    expect(missing).toThrow(`echo "avrt_$(openssl rand -hex 24)"`);
    expect(missing).toThrow("AVEN_LOCAL_RUNNER=off");
  });

  test("makes a different one per process only with no built-in runner", () => {
    const [a, b] = [localRunnerToken(undefined, "off"), localRunnerToken(undefined, "off")];
    expect(a).toStartWith("avrt_local_");
    expect(a).not.toBe(b);
  });

  test("refuses one that could not authenticate or is short enough to guess", () => {
    expect(() => localRunnerToken("secret".repeat(10), "on")).toThrow("must start with avrt_");
    expect(() => localRunnerToken("avrt_short", "on")).toThrow("at least 32 characters");
  });
});
