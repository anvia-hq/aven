import { describe, expect, test } from "bun:test";
import type { AnyTool } from "@anvia/core";
import { createCodingAgent } from "@aven/agents/coding-agent";
import { scriptedModel, text } from "@aven/agents/testing/scripted-model";

import { toolsForRun } from "./run-tools";
import type { ThreadWorkspaces } from "./sandbox";
import type { CreateSubagent } from "./subagent-runner";

const sandbox = {
  workspace: async () => undefined,
} as unknown as ThreadWorkspaces;

describe("toolsForRun", () => {
  test("the run's agent has the memory tool and its subagents do not (decision 0102)", async () => {
    const given: string[][] = [];
    const createSubagent: CreateSubagent = ({ tools }) => {
      given.push(tools.map((tool) => tool.name));
      return createCodingAgent({
        model: scriptedModel([[text("done")]]),
        tools,
        webSearch: false,
        questions: false,
      }).agent;
    };
    const tools = toolsForRun({
      sandbox,
      thread: { id: "t1", organizationId: "o1" },
      tools: [],
      current: () => [],
      attended: true,
      repoAccess: async () => ({ cloneUrl: "", defaultBranch: "main", token: "" }),
      defineGoal: () => undefined,
      createSubagent,
      emit: () => undefined,
      memory: async () => "ok",
    });
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("memory");

    const spawn = tools.find((tool) => tool.name === "spawn_agent") as AnyTool & {
      call(input: unknown): Promise<unknown>;
    };
    await spawn.call({ tasks: [{ description: "task", prompt: "look", type: "general" }] });
    expect(given).toHaveLength(1);
    expect(given[0]).not.toContain("memory");
  });
});
