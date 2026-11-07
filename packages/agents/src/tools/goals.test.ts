import { describe, expect, test } from "bun:test";

import {
  createGoalTools,
  GET_GOAL_TOOL_NAME,
  START_GOAL_TOOL_NAME,
  UPDATE_GOAL_TOOL_NAME,
} from "./goals";
import type { GoalHost } from "./types";
import type { BotGoalView } from "@aven/protocol/types";

const goal: BotGoalView = {
  objective: "Port the parser",
  checks: ["bun test", "bun run lint"],
  phase: "active",
  blockedReason: null,
  round: 2,
  maxRounds: 20,
};

function host(options: { goal?: BotGoalView | null; failed?: string[]; check?: boolean } = {}) {
  const calls: unknown[] = [];
  const current = options.goal === undefined ? goal : options.goal;
  const hosted: GoalHost = {
    get: async () => (calls.push(["get"]), current),
    start: async (input) => (calls.push(["start", input]), goal),
    update: async (action, reason) => (calls.push(["update", action, reason]), goal),
    check:
      options.check === false
        ? undefined
        : async (checks) => (calls.push(["check", checks]), options.failed ?? []),
  };
  const [get, start, update] = createGoalTools(hosted);
  return { calls, get, start, update };
}

describe("the goal tools", () => {
  test("are three, named for what they do", () => {
    const { get, start, update } = host();
    expect([get.name, start.name, update.name]).toEqual([
      GET_GOAL_TOOL_NAME,
      START_GOAL_TOOL_NAME,
      UPDATE_GOAL_TOOL_NAME,
    ]);
  });

  test("get returns the goal, or null", async () => {
    expect(await host().get.call({})).toEqual({ goal });
    expect(await host({ goal: null }).get.call({})).toEqual({ goal: null });
  });

  test("start needs no checks, and complete hands the checks the signal of the reply", async () => {
    const { calls, start } = host();
    await start.call({ objective: "Think" });
    expect(calls).toEqual([["start", { objective: "Think", checks: [] }]]);

    const seen: (AbortSignal | undefined)[] = [];
    const [, , update] = createGoalTools({
      get: async () => goal,
      start: async () => goal,
      update: async () => goal,
      check: async (_checks, signal) => (seen.push(signal), []),
    });
    const controller = new AbortController();
    await update.call({ action: "complete" }, { abortSignal: controller.signal });
    expect(seen).toEqual([controller.signal]);
  });

  test("start hands the host what the model chose and tells it to say so and stop", async () => {
    const { calls, start } = host();
    const result = (await start.call({
      objective: " Port the parser ",
      checks: [" bun test "],
      maxRounds: 5,
    })) as { goal: BotGoalView; next: string };

    expect(calls).toEqual([
      ["start", { objective: "Port the parser", checks: ["bun test"], maxRounds: 5 }],
    ]);
    expect(result.goal).toEqual(goal);
    expect(result.next).toContain("then stop");
  });

  test("an objective with nothing in it, too many checks, or a round count out of range are refused", async () => {
    const { calls, start } = host();
    await expect(start.call({ objective: " ", checks: [] })).rejects.toThrow();
    await expect(
      start.call({ objective: "o", checks: Array.from({ length: 9 }, () => "true") }),
    ).rejects.toThrow();
    await expect(start.call({ objective: "o", checks: [], maxRounds: 0 })).rejects.toThrow();
    await expect(start.call({ objective: "o", checks: [], maxRounds: 101 })).rejects.toThrow();
    await expect(start.call({ objective: "o", checks: [""] })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  test("complete runs the checks first, and the goal is completed only when they pass", async () => {
    const { calls, update } = host();

    const result = (await update.call({ action: "complete" })) as { next: string };

    expect(calls).toEqual([
      ["get"],
      ["check", ["bun test", "bun run lint"]],
      ["update", "complete", undefined],
    ]);
    expect(result.next).toContain("The goal is complete");
  });

  test("complete with a check that fails is not completed, and the model is told what failed", async () => {
    const { calls, update } = host({ failed: ["$ bun test\n2 failed"] });

    const result = (await update.call({ action: "complete" })) as { next: string };

    expect(calls.map((call) => (call as string[])[0])).toEqual(["get", "check"]);
    expect(result.next).toContain("not complete");
    expect(result.next).toContain("$ bun test\n2 failed");
  });

  test("complete with no checks, or a goal already complete, runs none", async () => {
    const none = host({ goal: { ...goal, checks: [] } });
    await none.update.call({ action: "complete" });
    expect(none.calls.map((call) => (call as string[])[0])).toEqual(["get", "update"]);

    const done = host({ goal: { ...goal, phase: "complete" } });
    await done.update.call({ action: "complete" });
    expect(done.calls.map((call) => (call as string[])[0])).toEqual(["get", "update"]);
  });

  test("complete with checks and no computer to run them on is an error, not a pass", async () => {
    const { calls, update } = host({ check: false });
    await expect(update.call({ action: "complete" })).rejects.toThrow("no computer");
    expect(calls.map((call) => (call as string[])[0])).toEqual(["get"]);
  });

  test("the other actions go straight to the host, blocked with its reason", async () => {
    const { calls, update } = host();
    await update.call({ action: "blocked", reason: " needs a key " });
    await update.call({ action: "pause" });
    await update.call({ action: "resume" });
    await update.call({ action: "clear" });

    expect(calls).toEqual([
      ["update", "blocked", "needs a key"],
      ["update", "pause", undefined],
      ["update", "resume", undefined],
      ["update", "clear", undefined],
    ]);
    await expect(update.call({ action: "finish" as never })).rejects.toThrow();
  });

  test("a refusal of the host reaches the model as the tool's error", async () => {
    const refusing: GoalHost = {
      get: async () => null,
      start: async () => {
        throw new Error("Start a goal only when the person asks you to, in their own message");
      },
      update: async () => null,
    };
    const [, start] = createGoalTools(refusing);
    await expect(start.call({ objective: "o", checks: [] })).rejects.toThrow("Start a goal only");
  });
});
