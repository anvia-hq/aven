import { describe, expect, test } from "bun:test";
import { createTool, type AnyTool, type AssistantContentPart } from "@anvia/core";
import { createCodingAgent } from "@aven/agents/coding-agent";
import { SUBAGENT_MAX_TURNS } from "@aven/agents/subagents";
import { scriptedModel, text } from "@aven/agents/testing/scripted-model";
import { createSpawnAgentTool } from "@aven/agents/tools/spawn-agent";
import { z } from "zod";

import { defaultCreateAgent } from "./runner";
import { subagentRunner, type CreateSubagent } from "./subagent-runner";

const named = (name: string): AnyTool =>
  createTool({ name, description: name, inputSchema: z.object({}), execute: () => name });
const parentTools = ["read_file", "write_file", "exec_command", "ask_user", "spawn_agent"].map(
  named,
);

// A subagent whose model says what is scripted for its id, and a record of what it was given.
function scripted(steps: Record<string, AssistantContentPart[][]>) {
  const made: { id: string; tools: string[] }[] = [];
  const create: CreateSubagent = ({ id, tools }) => {
    made.push({ id, tools: tools.map((tool) => tool.name) });
    const model = scriptedModel(steps[id] ?? [[text(`no script for ${id}`)]]);
    return createCodingAgent({ model, tools, webSearch: false, questions: false }).agent;
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
    const run = subagentRunner(parentTools, create);

    expect(await run(task("explore"), { index: 0 })).toBe("It is in src/a.ts:3");
    expect(made).toEqual([{ id: "subagent-explore-0", tools: ["read_file", "exec_command"] }]);
  });

  test("a subagent that reads a file with its tool answers with what it found", async () => {
    const readFile = createTool({
      name: "read_file",
      description: "Reads a file.",
      inputSchema: z.object({ path: z.string() }),
      execute: ({ path }) => `contents of ${path}`,
    });
    const { create } = scripted({
      "subagent-explore-0": [
        [{ type: "tool-call", toolCallId: "c1", toolName: "read_file", input: { path: "a.ts" } }],
        [text("a.ts says: contents of a.ts")],
      ],
    });
    const run = subagentRunner([readFile], create);

    expect(await run(task("explore"), { index: 0 })).toBe("a.ts says: contents of a.ts");
  });

  test("a subagent that fails, or is cancelled, is an error for the call", async () => {
    const create: CreateSubagent = ({ tools }) =>
      createCodingAgent({
        model: scriptedModel([]),
        tools,
        webSearch: false,
        questions: false,
      }).agent;
    const run = subagentRunner(parentTools, create);
    await expect(run(task("explore"), { index: 0 })).rejects.toThrow("no step 1 scripted");

    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(
      subagentRunner(parentTools, scripted({}).create)(task("explore"), {
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
    const spawn = createSpawnAgentTool(subagentRunner(parentTools, create));
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
      webSearch: false,
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
      // A run's agent has a person to ask; a subagent never does.
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
    expect(agent.defaultMaxTurns).not.toBe(SUBAGENT_MAX_TURNS);
    expect(agent.tools.map((tool) => tool.name)).toContain("ask_user");
  });
});
