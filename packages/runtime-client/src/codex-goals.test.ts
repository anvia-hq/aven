import { describe, expect, test } from "bun:test";

import { followCodexGoal } from "./codex-goals";
import type { CommandResult, GoalSpec } from "./types";

function goal(verify: () => Promise<CommandResult[]>, maxSessions = 4): GoalSpec {
  return {
    runId: "run-1",
    request: {
      objective: "ship it",
      acceptanceCriteria: ["tests pass"],
      verifyCommands: ["bun test"],
      maxSessions,
    },
    input: {},
    verify,
    onEvent: () => undefined,
    onSession: async () => undefined,
  };
}

describe("a Codex goal", () => {
  test("stops when the verify commands pass", async () => {
    const prompts: string[] = [];
    const followed = followCodexGoal(
      goal(async () => [{ command: "bun test", exitCode: 0, output: "ok" }]),
      async (prompt) => {
        prompts.push(prompt);
        return { messages: [], text: "done" };
      },
    );
    const end = await followed.done;

    expect(end.type).toBe("complete");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("ship it");
  });

  test("pauses after the same failure three times", async () => {
    const followed = followCodexGoal(
      goal(async () => [{ command: "bun test", exitCode: 1, output: "same failure" }], 10),
      async () => ({ messages: [], text: "still going" }),
    );
    const end = await followed.done;

    expect(end).toMatchObject({ type: "paused", reason: "no_progress" });
  });
});
