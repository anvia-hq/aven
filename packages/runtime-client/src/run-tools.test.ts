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
  test("the run's agent has the memory tool and a read-only cockpit, and its subagents neither (decisions 0102 and 0109)", async () => {
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
      cockpit: async () => "ok",
    });
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("memory");
    // The cockpit is read only for a thread's agent (decision 0109): no write is offered.
    const cockpit = tools.find((tool) => tool.name === "cockpit") as AnyTool & {
      call(input: unknown): Promise<unknown>;
    };
    expect(await cockpit.call({ command: "list", kind: "notes" })).toBe("ok");
    await expect(cockpit.call({ command: "create", kind: "notes", title: "x" })).rejects.toThrow();

    const spawn = tools.find((tool) => tool.name === "spawn_agent") as AnyTool & {
      call(input: unknown): Promise<unknown>;
    };
    await spawn.call({ tasks: [{ description: "task", prompt: "look", type: "general" }] });
    expect(given).toHaveLength(1);
    expect(given[0]).not.toContain("memory");
    expect(given[0]).not.toContain("cockpit");
  });

  test("the fork tools are the run's agent's alone, and only when the host gives them (decision 0135)", async () => {
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
    const base = {
      sandbox,
      thread: { id: "t1", organizationId: "o1" },
      tools: [],
      current: () => [],
      attended: true,
      repoAccess: async () => ({ cloneUrl: "", defaultBranch: "main", token: "" }),
      defineGoal: () => undefined,
      createSubagent,
      emit: () => undefined,
    };
    const forks = {
      start: async () => ({ id: "x", title: "x" }),
      status: async () => {
        throw new Error("unused");
      },
      take: async () => ({ empty: true as const }),
    };
    const without = toolsForRun(base).map((tool) => tool.name);
    expect(without).not.toContain("fork_thread");

    const tools = toolsForRun({ ...base, forks });
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["fork_thread", "fork_status", "take_fork_changes"]),
    );
    const spawn = tools.find((tool) => tool.name === "spawn_agent") as AnyTool & {
      call(input: unknown): Promise<unknown>;
    };
    await spawn.call({ tasks: [{ description: "task", prompt: "look", type: "general" }] });
    expect(given[0]).not.toContain("fork_thread");
  });
});
