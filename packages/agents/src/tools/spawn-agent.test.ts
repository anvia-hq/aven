import { describe, expect, test } from "bun:test";

import { MAX_PARALLEL_SUBAGENTS } from "../subagents";
import { createSpawnAgentTool, spawnAgentSchema, type SubagentTask } from "./spawn-agent";

const task = (name: string, type: SubagentTask["type"] = "explore"): SubagentTask => ({
  description: name,
  prompt: `Do ${name}`,
  type,
});

describe("spawn_agent", () => {
  test("returns what each subagent said, in the order asked", async () => {
    const tool = createSpawnAgentTool(async ({ description }, { index }) => {
      // The first finishes last: the order of the answers is the order of the tasks.
      await Bun.sleep((3 - index) * 10);
      return `  ${description} done\n`;
    });
    const result = await tool.call({ tasks: [task("a"), task("b", "general"), task("c")] });
    expect(result).toEqual({
      results: [
        { description: "a", type: "explore", status: "done", output: "a done" },
        { description: "b", type: "general", status: "done", output: "b done" },
        { description: "c", type: "explore", status: "done", output: "c done" },
      ],
    });
  });

  test("runs all six tasks at the same time", async () => {
    let running = 0;
    let peak = 0;
    let release!: () => void;
    const everyoneStarted = new Promise<void>((resolve) => (release = resolve));
    const tool = createSpawnAgentTool(async () => {
      peak = Math.max(peak, ++running);
      if (running === MAX_PARALLEL_SUBAGENTS) release();
      // Nobody finishes until all six have started: sequential execution would hang here.
      await everyoneStarted;
      running--;
      return "ok";
    });
    const tasks = Array.from({ length: MAX_PARALLEL_SUBAGENTS }, (_, i) => task(`t${i}`));
    await tool.call({ tasks });
    expect(peak).toBe(MAX_PARALLEL_SUBAGENTS);
  });

  test("a failed subagent is reported and the others still answer", async () => {
    const tool = createSpawnAgentTool(async ({ description }) => {
      if (description === "bad") throw new Error("the model refused");
      return "fine";
    });
    const result = await tool.call({ tasks: [task("good"), task("bad")] });
    expect(result).toEqual({
      results: [
        { description: "good", type: "explore", status: "done", output: "fine" },
        { description: "bad", type: "explore", status: "error", error: "the model refused" },
      ],
    });
  });

  test("a subagent that says nothing is told so", async () => {
    const tool = createSpawnAgentTool(async () => "  ");
    const result = (await tool.call({ tasks: [task("quiet")] })) as {
      results: { output: string }[];
    };
    expect(result.results[0]?.output).toContain("without saying anything");
  });

  test("passes each task's place in the call and the abort signal on", async () => {
    const seen: unknown[] = [];
    const tool = createSpawnAgentTool(async (_task, context) => {
      seen.push(context);
      return "ok";
    });
    const abortSignal = new AbortController().signal;
    await tool.call({ tasks: [task("a"), task("b")] }, { abortSignal });
    expect(seen).toEqual([
      { index: 0, abortSignal },
      { index: 1, abortSignal },
    ]);
  });

  test("a cancelled run fails the call instead of returning results", async () => {
    const controller = new AbortController();
    const tool = createSpawnAgentTool(async () => {
      controller.abort(new Error("cancelled"));
      throw new Error("aborted");
    });
    await expect(
      tool.call({ tasks: [task("a")] }, { abortSignal: controller.signal }),
    ).rejects.toThrow("cancelled");
  });

  test("takes one to six tasks, each with a description, a prompt and a known type", () => {
    const tasks = (count: number) => Array.from({ length: count }, (_, i) => task(`t${i}`));
    expect(spawnAgentSchema.safeParse({ tasks: tasks(1) }).success).toBe(true);
    expect(spawnAgentSchema.safeParse({ tasks: tasks(6) }).success).toBe(true);
    expect(spawnAgentSchema.safeParse({ tasks: [] }).success).toBe(false);
    expect(spawnAgentSchema.safeParse({ tasks: tasks(7) }).success).toBe(false);
    expect(spawnAgentSchema.safeParse({ tasks: [{ ...task("a"), type: "wizard" }] }).success).toBe(
      false,
    );
    expect(spawnAgentSchema.safeParse({ tasks: [{ ...task("a"), prompt: "" }] }).success).toBe(
      false,
    );
  });
});
