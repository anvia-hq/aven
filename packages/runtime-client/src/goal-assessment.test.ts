import { createTool, type Message } from "@anvia/core";
import type { GoalAssessment } from "@anvia/durable";
import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { assessGoal, verifyWith } from "./goal-assessment";
import type { CommandResult } from "@aven/agent-backend/types";

const assistant = (text: string): Message => ({
  role: "assistant",
  content: [{ type: "text", text }],
});

const session = (
  status: "response" | "exhausted" = "response",
  said = "Did the work.",
): GoalAssessment =>
  ({
    agentId: "goal",
    objective: "o",
    acceptanceCriteria: ["c"],
    previous: null,
    session: {
      runId: "r",
      status,
      output: said,
      messages: [assistant(said)],
      roundMessages: [assistant(said)],
      modelTurns: 1,
      usage: {} as never,
    },
  }) satisfies GoalAssessment;

const passed: CommandResult = { command: "bun test", exitCode: 0, output: "ok" };
const failed: CommandResult = { command: "bun test", exitCode: 1, output: "1 failed" };

describe("assessGoal", () => {
  test("completes when every command passes, saying which", async () => {
    const decision = await assessGoal(session(), async () => [passed]);
    expect(decision).toMatchObject({ status: "complete", summary: "Did the work." });
    expect(decision.evidence).toEqual(["`bun test` passed"]);
  });

  test("with no commands it completes on the agent's word, and says that is all it had", async () => {
    const decision = await assessGoal(session(), async () => []);
    expect(decision.status).toBe("complete");
    expect(decision.evidence[0]).toContain("No commands");
  });

  test("continues with the failing output when a command fails", async () => {
    const decision = await assessGoal(session(), async () => [passed, failed]);
    expect(decision.status).toBe("continue");
    expect(decision.next).toContain("1 failed");
    expect(decision.next).not.toContain("ok");
  });

  test("the same failure twice gives the same progress key, a different one does not", async () => {
    const a = await assessGoal(session(), async () => [failed]);
    const b = await assessGoal(session(), async () => [failed]);
    const c = await assessGoal(session(), async () => [{ ...failed, output: "2 failed" }]);
    expect(a.progressKey).toBe(b.progressKey);
    expect(a.progressKey).not.toBe(c.progressKey);
  });

  test("a session that ran out of steps continues without running the commands", async () => {
    let ran = false;
    const decision = await assessGoal(session("exhausted"), async () => {
      ran = true;
      return [passed];
    });
    expect(decision.status).toBe("continue");
    expect(ran).toBe(false);
  });
});

describe("verifyWith", () => {
  const exec = (results: Record<string, unknown>) =>
    createTool({
      name: "exec_command",
      description: "run",
      inputSchema: z.object({ command: z.string(), timeoutMs: z.number().optional() }),
      handler: ({ command }) => results[command],
    });

  test("runs the commands in order and reports exit codes and output", async () => {
    const verify = verifyWith(
      exec({
        build: { status: "exited", exitCode: 0, stdout: "built", stderr: "" },
        test: { status: "exited", exitCode: 2, stdout: "", stderr: "boom" },
      }),
      ["build", "test"],
    );
    expect(await verify()).toEqual([
      { command: "build", exitCode: 0, output: "built" },
      { command: "test", exitCode: 2, output: "boom" },
    ]);
  });

  test("a command that times out has no exit code", async () => {
    const [result] = await verifyWith(
      exec({ slow: { status: "timed_out", stdout: "", stderr: "" } }),
      ["slow"],
    )();
    expect(result).toMatchObject({ command: "slow", exitCode: null });
    expect(result?.output).toContain("timed out");
  });

  test("no sandbox is an error, not a pass", async () => {
    await expect(verifyWith(undefined, ["bun test"])()).rejects.toThrow("not running");
  });
});
