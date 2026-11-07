import { describe, expect, test } from "bun:test";

import type { ForkView } from "@aven/protocol/forks";

import { projectToolOutput } from "../tool-projection";
import { createWaitForForksTool, WAIT_FOR_FORKS_TOOL_NAME } from "./wait-for-forks";

const A = crypto.randomUUID();
const B = crypto.randomUUID();

function setup(endsAt: Record<string, number>) {
  let now = 0;
  const slept: number[] = [];
  const clock = {
    now: () => now,
    sleep: async (ms: number) => {
      slept.push(ms);
      now += ms;
    },
  };
  const look = async (id: string): Promise<ForkView> => ({
    id,
    title: `fork ${id.slice(0, 4)}`,
    running: now < (endsAt[id] ?? 0),
    archived: false,
    error: null,
    lastMessage: now >= (endsAt[id] ?? 0) ? `report of ${id.slice(0, 4)}` : "",
  });
  const tool = createWaitForForksTool(look, clock) as unknown as {
    call(input: unknown): Promise<Record<string, any>>;
  };
  return { tool, slept };
}

describe("wait_for_forks (decision 0143)", () => {
  test("returns when the last fork has stopped, with each one's report", async () => {
    const { tool } = setup({ [A]: 12_000, [B]: 30_000 });
    const result = await tool.call({ ids: [A, B] });
    expect(result.allStopped).toBe(true);
    expect(result.waitedSeconds).toBe(30);
    expect(result.forks.map((f: { lastMessage: string }) => f.lastMessage)).toEqual([
      `report of ${A.slice(0, 4)}`,
      `report of ${B.slice(0, 4)}`,
    ]);
    expect(result.summary).toContain("All 2 forks have stopped");
  });

  test("returns at the time limit with the forks that still work", async () => {
    const { tool } = setup({ [A]: 1_000_000, [B]: 5_000 });
    const result = await tool.call({ ids: [A, B], timeoutSeconds: 20 });
    expect(result.allStopped).toBe(false);
    expect(result.waitedSeconds).toBe(20);
    expect(result.summary).toBe("1 of 2 forks are still working after 20s.");
  });

  test("is projected with its own summary", () => {
    const value = { summary: "All 1 forks have stopped working after 5s." };
    expect(projectToolOutput({ type: "json", value }, WAIT_FOR_FORKS_TOOL_NAME).output).toBe(
      value.summary,
    );
  });
});
