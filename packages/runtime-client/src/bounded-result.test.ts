import { describe, expect, test } from "bun:test";

import { boundResult } from "./bounded-result";

const megabytes = (n: number) => "x".repeat(n * 1024 * 1024);

describe("a tool result that must fit in the journal", () => {
  test("is left as it is when it is small, or large but fits", () => {
    const small = { status: "exited", stdout: "ok\n", stderr: "", exitCode: 0 };
    expect(boundResult(small)).toBe(small);

    const large = { stdout: "y".repeat(600_000) };
    expect(boundResult(large)).toBe(large);
  });

  test("a command with too much output keeps the end of it, says it was cut and fits", () => {
    const stdout = `${"build line\n".repeat(300_000)}FAILED: the last line\n`;
    const result = {
      status: "exited" as const,
      stdout,
      stderr: "",
      exitCode: 1,
      stdoutTruncated: false,
      stderrTruncated: false,
    };

    const bounded = boundResult(result);

    expect(new TextEncoder().encode(JSON.stringify(bounded)).byteLength).toBeLessThan(1_048_576);
    expect(bounded.stdout.endsWith("FAILED: the last line\n")).toBe(true);
    expect(bounded.stdout.startsWith("[… output cut")).toBe(true);
    expect(bounded.stdoutTruncated).toBe(true);
    expect(bounded.stderrTruncated).toBe(false);
    expect(bounded.exitCode).toBe(1);
  });

  test("both stdout and stderr are cut when both are too long", () => {
    const bounded = boundResult({ stdout: megabytes(2), stderr: megabytes(2), exitCode: 0 });

    expect(new TextEncoder().encode(JSON.stringify(bounded)).byteLength).toBeLessThan(1_048_576);
    expect(bounded.stdout.length).toBeGreaterThan(1000);
    expect(bounded.stderr.length).toBeGreaterThan(1000);
    expect(bounded.exitCode).toBe(0);
  });

  test("text that is more than one byte a character is counted as bytes", () => {
    const bounded = boundResult({ stdout: "é".repeat(700_000) });

    expect(new TextEncoder().encode(JSON.stringify(bounded)).byteLength).toBeLessThan(1_048_576);
  });

  test("a result that cannot be made small is an error, not a failure of the run", () => {
    expect(() => boundResult("z".repeat(2_000_000))).toThrow("too long to keep");
    expect(() => boundResult({ data: Array.from({ length: 200_000 }, (_, i) => i) })).toThrow(
      "too long to keep",
    );
  });
});
