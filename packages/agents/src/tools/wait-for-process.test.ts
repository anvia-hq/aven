import { describe, expect, test } from "bun:test";

import { projectToolOutput, toolTarget } from "../tool-projection";
import { createWaitForProcessTool, MAX_WAIT_SECONDS, type ProcessWatch } from "./wait-for-process";

// A clock that only moves when the tool sleeps, so a minute's wait takes no time.
function clock() {
  let now = 0;
  const slept: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      slept.push(ms);
      now += ms;
    },
    slept,
  };
}

// A process that is `running` until `endsAt` ms, and prints each line from the time it gives.
function process(
  time: { now(): number },
  {
    endsAt,
    exitCode = 0,
    lines = [],
  }: { endsAt?: number; exitCode?: number; lines?: [number, string][] },
): ProcessWatch {
  return {
    status: async () => ({
      status: endsAt !== undefined && time.now() >= endsAt ? "exited" : "running",
      exitCode: endsAt !== undefined && time.now() >= endsAt ? exitCode : null,
    }),
    tail: async () => ({
      stdout: lines
        .filter(([at]) => time.now() >= at)
        .map(([, text]) => text)
        .join("\n"),
      stderr: "",
    }),
  };
}

describe("wait_for_process", () => {
  test("returns when the process ends, with its exit code and the end of its output", async () => {
    const time = clock();
    const tool = createWaitForProcessTool(
      process(time, {
        endsAt: 5000,
        exitCode: 1,
        lines: [
          [0, "building"],
          [4000, "failed: x"],
        ],
      }),
      time,
    );
    const result = await tool.call({ processId: "p1", timeoutSeconds: 60 });
    expect(result).toMatchObject({
      status: "ended",
      exitCode: 1,
      matched: false,
      waitedSeconds: 5,
      stdout: "building\nfailed: x",
      summary: "The process ended with exit code 1 after 5s.",
    });
  });

  test("returns as soon as the output has the text, while the process still runs", async () => {
    const time = clock();
    const tool = createWaitForProcessTool(
      process(time, {
        lines: [
          [0, "starting"],
          [3000, "Compiled successfully"],
        ],
      }),
      time,
    );
    const result = await tool.call({ processId: "p1", until: "Compiled successfully" });
    expect(result).toMatchObject({ status: "running", matched: true, waitedSeconds: 3 });
    expect((result as { summary: string }).summary).toContain("still running");
  });

  test("stops waiting at the timeout and says the process is still running", async () => {
    const time = clock();
    const tool = createWaitForProcessTool(process(time, { lines: [[0, "working"]] }), time);
    const result = await tool.call({ processId: "p1", timeoutSeconds: 10 });
    expect(result).toMatchObject({
      status: "running",
      matched: false,
      waitedSeconds: 10,
      stdout: "working",
      summary: "The process is still running after 10s.",
    });
    // It looked once a second, and never slept past the deadline.
    expect(time.slept).toEqual(Array.from({ length: 10 }, () => 1000));
  });

  test("returns at once for a process that has already ended", async () => {
    const time = clock();
    const tool = createWaitForProcessTool(process(time, { endsAt: 0, lines: [[0, "done"]] }), time);
    expect(await tool.call({ processId: "p1" })).toMatchObject({
      status: "ended",
      waitedSeconds: 0,
    });
    expect(time.slept).toEqual([]);
  });

  test("fails for a process that is not there, and for a wait past the limit", async () => {
    const time = clock();
    const tool = createWaitForProcessTool(
      {
        status: async () => {
          throw new Error("No process nope");
        },
        tail: async () => ({ stdout: "", stderr: "" }),
      },
      time,
    );
    await expect(tool.call({ processId: "nope" })).rejects.toThrow("No process nope");
    await expect(
      tool.call({ processId: "p", timeoutSeconds: MAX_WAIT_SECONDS + 1 }),
    ).rejects.toThrow();
  });

  test("stops when the run is cancelled", async () => {
    const time = clock();
    const tool = createWaitForProcessTool(process(time, {}), time);
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(
      tool.call({ processId: "p1" }, { abortSignal: controller.signal } as never),
    ).rejects.toThrow("cancelled");
  });

  test("a client sees what it waited for and how it went, not the raw output", () => {
    expect(toolTarget("wait_for_process", { processId: "p1", until: "x" })).toBe("p1");
    const value = {
      status: "ended",
      summary: "The process ended after 5s.",
      stdout: "lots of text",
    };
    expect(projectToolOutput({ type: "json", value }, "wait_for_process").output).toBe(
      "The process ended after 5s.",
    );
  });
});
