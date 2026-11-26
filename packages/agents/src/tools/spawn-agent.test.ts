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
      await Bun.sleep((3 - index) * 10);
      return `  ${description} done\n`;
    });
    const result = await tool.call({ tasks: [task("a"), task("b", "general"), task("c")] });
    expect(result).toBe(
      ["[1/3] a (explore)\na done", "[2/3] b (general)\nb done", "[3/3] c (explore)\nc done"].join(
        "\n\n",
      ),
    );
  });

  test("runs all six tasks at the same time", async () => {
    let running = 0;
    let peak = 0;
    let release!: () => void;
    const everyoneStarted = new Promise<void>((resolve) => (release = resolve));
    const tool = createSpawnAgentTool(async () => {
      peak = Math.max(peak, ++running);

      if (running === MAX_PARALLEL_SUBAGENTS) release();

      await everyoneStarted;
      running--;
      return "ok";
    });
    const tasks = Array.from({ length: MAX_PARALLEL_SUBAGENTS }, (_, i) => task(`t${i}`));
    await tool.call({ tasks });
    expect(peak).toBe(MAX_PARALLEL_SUBAGENTS);
  });

  test("a task that names no type explores", () => {
    expect(spawnAgentSchema.parse({ tasks: [{ description: "a", prompt: "p" }] })).toEqual({
      tasks: [{ description: "a", prompt: "p", type: "explore" }],
    });
  });

  test("a failed subagent is reported and the others still answer", async () => {
    const tool = createSpawnAgentTool(async ({ description }) => {
      if (description === "bad") throw new Error("the model refused");

      return "fine";
    });
    const result = await tool.call({ tasks: [task("good"), task("bad")] });
    expect(result).toBe(
      ["[1/2] good (explore)\nfine", "[2/2] bad (explore) — ERROR\nthe model refused"].join("\n\n"),
    );
  });

  test("a subagent that says nothing is told so", async () => {
    const tool = createSpawnAgentTool(async () => "  ");
    const result = await tool.call({ tasks: [task("quiet")] });
    expect(result).toContain("without saying anything");
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
