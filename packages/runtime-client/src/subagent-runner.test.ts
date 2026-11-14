import { describe, expect, test } from "bun:test";
import { createTool, type AnyTool, type AssistantContentPart } from "@anvia/core";
import { createCodingAgent } from "@aven/agents/coding-agent";
import { CODING_MAX_TURNS } from "@aven/agents/turn-limits";
import { SUBAGENT_MAX_TURNS } from "@aven/agents/subagents";
import { scriptedModel, text } from "@aven/agents/testing/scripted-model";
import { createSpawnAgentTool } from "@aven/agents/tools/spawn-agent";
import { z } from "zod";

import { defaultCreateAgent } from "./runner";
import { subagentRunner } from "./subagent-runner";
import type { RunEvent } from "@aven/protocol/types";
import type { CreateSubagent } from "./types";

const named = (name: string): AnyTool =>
  createTool({ name, description: name, inputSchema: z.object({}), handler: () => name });
const parentTools = ["read_file", "write_file", "exec_command", "ask_user", "spawn_agent"].map(
  named,
);

function scripted(steps: Record<string, AssistantContentPart[][]>) {
  const made: { id: string; tools: string[] }[] = [];
  const create: CreateSubagent = ({ id, tools }) => {
    made.push({ id, tools: tools.map((tool) => tool.name) });
    const model = scriptedModel(steps[id] ?? [[text(`no script for ${id}`)]]);
    return createCodingAgent({ model, tools, questions: false }).agent;
  };
  return { create, made };
}

const task = (type: "explore" | "general", prompt = "look") => ({
  description: "task",
  prompt,
  type,
});

describe("subagentRunner", () => {
  test("returns the last message of the subagent, which worked with its type's tools", async () => {
    const { create, made } = scripted({ "subagent-explore-0": [[text("It is in src/a.ts:3")]] });
    const run = subagentRunner(parentTools, create, () => {});

    expect(await run(task("explore"), { index: 0 })).toBe("It is in src/a.ts:3");
    expect(made).toEqual([{ id: "subagent-explore-0", tools: ["read_file", "exec_command"] }]);
  });

  test("tells what it does as it goes, and how it ended", async () => {
    const readFile = createTool({
      name: "read_file",
      description: "Reads a file.",
      inputSchema: z.object({ path: z.string() }),
      handler: ({ path }) => `contents of ${path}`,
    });
    const { create } = scripted({
      "subagent-explore-3": [
        [{ type: "tool-call", toolCallId: "c1", toolName: "read_file", input: { path: "a.ts" } }],
        [text("a.ts is fine")],
      ],
    });
    const told: RunEvent[] = [];
    const answer = await subagentRunner([readFile], create, (event) => told.push(event))(
      task("explore"),
      { index: 3 },
    );

    expect(answer).toBe("a.ts is fine");

    expect(told.filter((event) => event.type === "usage")).toHaveLength(2);
    expect(told.filter((event) => event.type === "subagent")).toEqual([
      {
        type: "subagent",
        index: 3,
        event: {
          type: "tool_start",
          tool: { id: "c1", name: "read_file", target: "a.ts", status: "running" },
        },
      },
      { type: "subagent", index: 3, event: { type: "tool_end", id: "c1", status: "done" } },
      {
        type: "subagent",
        index: 3,
        event: { type: "end", status: "done", output: "a.ts is fine" },
      },
    ]);
  });

  test("tells that it failed, and why", async () => {
    const create: CreateSubagent = ({ tools }) =>
      createCodingAgent({
        model: scriptedModel([]),
        tools,
        questions: false,
      }).agent;
    const told: RunEvent[] = [];
    await expect(
      subagentRunner(parentTools, create, (event) => told.push(event))(task("general"), {
        index: 1,
      }),
    ).rejects.toThrow();
    expect(told.at(-1)).toMatchObject({
      type: "subagent",
      index: 1,
      event: { type: "end", status: "error", output: expect.stringContaining("no step 1") },
    });
  });

  test("a subagent that fails, or is cancelled, is an error for the call", async () => {
    const create: CreateSubagent = ({ tools }) =>
      createCodingAgent({
        model: scriptedModel([]),
        tools,
        questions: false,
      }).agent;
    const run = subagentRunner(parentTools, create, () => {});
    await expect(run(task("explore"), { index: 0 })).rejects.toThrow("no step 1 scripted");

    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(
      subagentRunner(parentTools, scripted({}).create, () => {})(task("explore"), {
        index: 0,
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  test("the agent hands tasks over, and the answers of its subagents come back as the tool's result", async () => {
    const { create, made } = scripted({
      "subagent-explore-0": [[text("auth lives in src/auth.ts")]],
      "subagent-general-1": [[text("added the test in src/auth.test.ts")]],
    });
    const spawn = createSpawnAgentTool(subagentRunner(parentTools, create, () => {}));
    let toolResult: unknown;
    const parent = createCodingAgent({
      model: scriptedModel([
        [
          {
            type: "tool-call",
            toolCallId: "s1",
            toolName: "spawn_agent",
            input: { tasks: [task("explore", "find auth"), task("general", "write a test")] },
          },
        ],
        (request) => {
          toolResult = JSON.stringify(request.chatHistory.at(-1));
          return [text("Done")];
        },
      ]),
      tools: [spawn],
      questions: false,
    }).agent;

    const stream = parent.stream({ prompt: "look into auth and test it" });
    for await (const _event of stream);
    expect((await stream.result).type).toBe("response");

    expect(made.map(({ id }) => id).sort()).toEqual(["subagent-explore-0", "subagent-general-1"]);
    expect(String(toolResult)).toContain("auth lives in src/auth.ts");
    expect(String(toolResult)).toContain("added the test in src/auth.test.ts");
  });
});

describe("the agent of a subagent", () => {
  const model = {
    provider: "openai",
    modelId: "gpt-test",
    gatewayPath: "/runtimes/gateway/openai",
    gatewayToken: "run-token",
  } as const;
  const thread = { id: "t1" } as never;
  const make = (role?: "explore" | "general") =>
    defaultCreateAgent("http://localhost:8000")({
      thread,
      id: "a",
      attended: !role,
      tools: [],
      model,
      role,
    }).agent;

  test("has its type's instructions, no questions and a limit on its steps", () => {
    const explorer = make("explore");
    expect(explorer.instructions).toContain("You are a subagent");
    expect(explorer.instructions).toContain("do not create, edit or delete files");
    expect(explorer.defaultMaxTurns).toBe(SUBAGENT_MAX_TURNS);
    expect(explorer.tools.map((tool) => tool.name)).not.toContain("ask_user");
  });

  test("an agent without a role is the coding agent", () => {
    const agent = make();
    expect(agent.instructions).toContain("You are a coding agent");
    expect(agent.defaultMaxTurns).toBe(CODING_MAX_TURNS);
    expect(agent.tools.map((tool) => tool.name)).toContain("ask_user");
  });
});
