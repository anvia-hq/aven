import { describe, expect, test } from "bun:test";

import { boundResult } from "./bounded-result";

describe("a tool result kept in the run's history", () => {
  test("is left as it is when its texts are short", () => {
    const small = { status: "exited", stdout: "ok\n", stderr: "", exitCode: 0 };
    expect(boundResult(small)).toBe(small);

    const long = { stdout: "y".repeat(100_000) };
    expect(boundResult(long)).toBe(long);
  });

  test("a command with too much output keeps the end of it, says it was cut and keeps the rest", () => {
    const stdout = `${"build line\n".repeat(300_000)}FAILED: the last line\n`;
    const result = {
      status: "exited" as const,
      stdout,
      stderr: "warning",
      exitCode: 1,
      stdoutTruncated: false,
      stderrTruncated: false,
    };

    const bounded = boundResult(result);

    expect(bounded.stdout.length).toBeLessThan(100_100);
    expect(bounded.stdout.endsWith("FAILED: the last line\n")).toBe(true);
    expect(bounded.stdout.startsWith("[… output cut")).toBe(true);
    expect(bounded.stdoutTruncated).toBe(true);
    // What was short is as it was.
    expect(bounded.stderr).toBe("warning");
    expect(bounded.stderrTruncated).toBe(false);
    expect(bounded.exitCode).toBe(1);
  });

  test("each text that is too long is cut on its own", () => {
    const bounded = boundResult({
      stdout: "a".repeat(500_000),
      stderr: "b".repeat(500_000),
      exitCode: 0,
    });

    expect(bounded.stdout.length).toBeLessThan(100_100);
    expect(bounded.stderr.length).toBeLessThan(100_100);
    expect(bounded.stdout.endsWith("aaa")).toBe(true);
    expect(bounded.stderr.endsWith("bbb")).toBe(true);
  });

  test("a screenshot is left alone, however much base64 it carries", () => {
    // What desktop_screenshot returns: a content list with the image as base64 in a part.
    const screenshot = {
      type: "content",
      value: [
        { type: "text", text: '{"width":1568,"height":882}' },
        {
          type: "file",
          data: { type: "data", data: "A".repeat(1_500_000) },
          mediaType: "image/png",
        },
      ],
    };

    expect(boundResult(screenshot)).toBe(screenshot);
  });

  test("a result that is huge even so is refused, not kept", () => {
    expect(() => boundResult({ value: [{ data: "A".repeat(9 * 1024 * 1024) }] })).toThrow(
      "too long to keep",
    );
    expect(() => boundResult("z".repeat(9 * 1024 * 1024))).toThrow("too long to keep");
  });
});
