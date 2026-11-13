import { createTool } from "@anvia/core";
import { describe, expect, test } from "bun:test";
import { createForkTools } from "@aven/agents/tools/forks";
import { z } from "zod";

import { callAvenTool, claudeMcpTools } from "./claude-mcp";
import type { ClaudeToolHost } from "@aven/agent-backend/types";

const command = createTool({
  name: "exec_command",
  description: "Run a command",
  inputSchema: z.object({ command: z.string() }),
  async execute({ command: line }, context) {
    context?.abortSignal?.throwIfAborted();
    return { status: "exited", exitCode: 0, stdout: line, stderr: "" };
  },
});

const question = {
  questions: [
    {
      id: "color",
      text: "Which color?",
      choices: [
        { label: "Red", value: "red" },
        { label: "Blue", value: "blue" },
      ],
    },
  ],
};

describe("Aven tools on the Claude agent's MCP server", () => {
  test("parks on a question and on a secret until the person answers", async () => {
    const parked: string[] = [];
    const host: ClaudeToolHost = {
      onPark: async (asked) => {
        parked.push(asked.name);
        expect(asked.questions[0]?.id).toBe("color");
        return "The person answered:\ncolor: red";
      },
    };
    expect(await callAvenTool("ask_user", question, host)).toContain("color: red");
    expect(await callAvenTool("request_secret", question, host)).toContain("color: red");
    expect(parked).toEqual(["ask_user", "request_secret"]);
  });

  test("offers the fork tools, stop_fork among them, and runs it against the fork host", async () => {
    const stopped: string[] = [];
    const id = crypto.randomUUID();
    const catalog = createForkTools({
      start: async () => ({ id, title: "x" }),
      status: async () => {
        throw new Error("unused");
      },
      stop: async (forkId) => {
        stopped.push(forkId);
        return {
          id: forkId,
          title: "x",
          running: false,
          archived: false,
          error: null,
          lastMessage: "",
          stopped: true,
        };
      },
      take: async () => ({ empty: true }),
    });
    const host = { catalog } as ClaudeToolHost;

    const names = (await claudeMcpTools(host)).map((tool) => tool.name);
    expect(names).toContain("stop_fork");

    const text = await callAvenTool("stop_fork", { id }, host);
    expect(stopped).toEqual([id]);
    expect(text).toContain("cancelled");
  });

  test("runs a sandbox tool and stops it when the run is cancelled", async () => {
    const signal = AbortSignal.abort();
    const text = await callAvenTool(
      "exec_command",
      { command: "ls" },
      { catalog: [command], signal },
    );
    expect(text.toLowerCase()).toContain("abort");
    expect(
      await callAvenTool("exec_command", { command: "pwd" }, { catalog: [command] }),
    ).toContain("pwd");
  });

  test("adds a message the person sent while the agent works to the next tool result", async () => {
    const pending = [
      {
        text: "Check out the branch first.",
        images: [{ mediaType: "image/png", data: "QUJDRA==" }],
      },
    ];
    const host: ClaudeToolHost = {
      catalog: [command],
      steered: () => pending.shift(),
    };
    const tool = (await claudeMcpTools(host)).find((item) => item.name === "exec_command");
    const first = JSON.stringify(await tool?.handler({ command: "pwd" }));
    expect(first).toContain("Check out the branch first.");
    expect(first).toContain('"type":"image"');
    expect(first).toContain("QUJDRA==");
    const second = JSON.stringify(await tool?.handler({ command: "pwd" }));
    expect(second).not.toContain("Check out");
  });

  test("shows an artifact the tool saved", async () => {
    const shown: unknown[] = [];
    const artifact = createTool({
      name: "show_artifact",
      description: "Show a file",
      inputSchema: z.object({ path: z.string() }),
      async execute() {
        return { artifacts: [{ name: "chart.png", mediaType: "image/png" }], paths: ["chart.png"] };
      },
    });
    const text = await callAvenTool(
      "show_artifact",
      { path: "chart.png" },
      { catalog: [artifact], shown: (artifacts) => shown.push(artifacts) },
    );
    expect(text).toContain("chart.png");
    expect(shown).toEqual([[{ name: "chart.png", mediaType: "image/png" }]]);
  });

  test("calls the host it was given, not another person's", async () => {
    const seen: unknown[] = [];
    const alice: ClaudeToolHost = {
      memory: async (input) => {
        seen.push(input);
        return "alice-note";
      },
    };
    const bob: ClaudeToolHost = { memory: async () => "bob-note" };
    expect(await callAvenTool("memory", { command: "view", path: "a.md" }, alice)).toBe(
      "alice-note",
    );
    expect(seen).toEqual([{ command: "view", path: "a.md" }]);
    expect(await callAvenTool("memory", { command: "view", path: "b.md" }, bob)).toBe("bob-note");
    expect(seen).toEqual([{ command: "view", path: "a.md" }]);
  });

  test("says when the run has no such tool host", async () => {
    expect(await callAvenTool("memory", { command: "view" }, {})).toBe("This run has no memory.");
    expect(await callAvenTool("unknown", {}, {})).toBe("This agent has no tool named unknown");
  });
});
