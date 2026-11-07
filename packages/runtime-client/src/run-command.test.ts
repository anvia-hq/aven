import { describe, expect, test } from "bun:test";

import { runCommand } from "./run-command";

describe("runCommand", () => {
  test("collects what a command wrote and how it ended", async () => {
    expect(await runCommand(["sh", "-c", "echo out; echo err >&2; exit 3"])).toEqual({
      code: 3,
      stdout: "out\n",
      stderr: "err\n",
    });
  });

  test("stops a command that outlasts its timeout, and says so", async () => {
    const started = Date.now();

    const result = await runCommand(["sleep", "30"], { timeoutMs: 100 });

    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("timed out after 100 ms");
    expect(result.timedOut).toBe(true);
  });

  test("a command that finishes in time is not marked", async () => {
    const result = await runCommand(["sh", "-c", "echo fine"], { timeoutMs: 10_000 });

    expect(result).toEqual({ code: 0, stdout: "fine\n", stderr: "" });
  });
});
