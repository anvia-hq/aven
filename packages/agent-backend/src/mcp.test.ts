import { createTool } from "@anvia/core";
import { ToolOutput } from "@anvia/core/tool";
import { createForkTools } from "@aven/agents/tools/forks";
import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { backendMcpTools, callAvenTool, callAvenToolResult, mcpInputSchema } from "./mcp";
import type { BackendToolHost } from "./types";

const command = createTool({
  name: "exec_command",
  description: "Run a command",
  inputSchema: z.object({ command: z.string() }),
  async handler({ command: line }, context) {
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

describe("Aven tools on the hosted backend MCP server", () => {
  test("parks on a question and on a secret until the person answers", async () => {
    const parked: string[] = [];
    const host: BackendToolHost = {
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

  test("offers open_browser on attended hosted runs and omits it when questions are off", async () => {
    const attended = (await backendMcpTools({})).map((tool) => tool.name);
    expect(attended).toContain("open_browser");

    const unattended = (await backendMcpTools({ questions: false })).map((tool) => tool.name);
    expect(unattended).not.toContain("open_browser");

    expect(await callAvenTool("open_browser", { port: 5173 }, {})).toContain(
      "http://localhost:5173",
    );
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
    const host = { catalog } as BackendToolHost;

    const names = (await backendMcpTools(host)).map((tool) => tool.name);
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
    const host: BackendToolHost = {
      catalog: [command],
      steered: () => pending.shift(),
    };
    const tool = (await backendMcpTools(host)).find((item) => item.name === "exec_command");
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
      async handler() {
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
    const alice: BackendToolHost = {
      memory: async (input) => {
        seen.push(input);
        return "alice-note";
      },
    };
    const bob: BackendToolHost = { memory: async () => "bob-note" };
    expect(await callAvenTool("memory", { command: "view", path: "a.md" }, alice)).toBe(
      "alice-note",
    );
    expect(seen).toEqual([{ command: "view", path: "a.md" }]);
    expect(await callAvenTool("memory", { command: "view", path: "b.md" }, bob)).toBe("bob-note");
    expect(seen).toEqual([{ command: "view", path: "a.md" }]);
  });

  test("says when the run has no such tool host and marks structured errors", async () => {
    expect(await callAvenToolResult("memory", { command: "view" }, {})).toEqual({
      text: "This run has no memory.",
      isError: true,
    });
    expect(await callAvenToolResult("unknown", {}, {})).toEqual({
      text: "This agent has no tool named unknown",
      isError: true,
    });

    const failing = createTool({
      name: "boom",
      description: "Fails",
      inputSchema: z.object({}),
      async handler() {
        throw new Error("disk full");
      },
    });
    const tools = await backendMcpTools({ catalog: [failing] });
    const tool = tools.find((item) => item.name === "boom");
    const result = await tool?.handler({});
    expect(result).toEqual({
      content: [{ type: "text", text: "disk full" }],
      isError: true,
    });
  });

  test("dispatches spawn_agent through host.runSubagent even when catalog has a stub", async () => {
    const catalogCalls: string[] = [];
    const subagentCalls: string[] = [];
    const catalogStub = createTool({
      name: "spawn_agent",
      description: "stub",
      inputSchema: z.object({}),
      async handler() {
        catalogCalls.push("wrong");
        return "wrong";
      },
    });
    const host: BackendToolHost = {
      catalog: [catalogStub],
      runSubagent: async (task) => {
        subagentCalls.push(task.prompt);
        return `found ${task.description}`;
      },
    };
    const tools = await backendMcpTools(host);
    const spawn = tools.find((item) => item.name === "spawn_agent");
    expect(spawn).toBeDefined();
    const mcpResult = await spawn!.handler({
      tasks: [{ description: "auth", prompt: "where is login?", type: "explore" }],
    });
    expect(mcpResult.isError).toBeUndefined();
    expect(JSON.stringify(mcpResult.content)).toContain("found auth");

    const direct = await callAvenToolResult(
      "spawn_agent",
      { tasks: [{ description: "db", prompt: "where is schema?", type: "explore" }] },
      host,
    );
    expect(direct.isError).toBe(false);
    expect(direct.text).toContain("found db");
    expect(subagentCalls).toEqual(["where is login?", "where is schema?"]);
    expect(catalogCalls).toEqual([]);
  });

  test("dispatches web_search through host.webSearch via backendMcpTools and callAvenTool", async () => {
    const requests: { url: string; auth: string | null; body: string }[] = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: String(url),
        auth: headers.get("authorization"),
        body: String(init?.body ?? ""),
      });
      return Response.json({
        answer: "Bun is fast",
        results: [{ title: "Bun", url: "https://bun.sh", content: "runtime" }],
      });
    }) as typeof fetch;

    const host: BackendToolHost = { webSearch: { apiKey: "tvly-secret-key" } };
    const tools = await backendMcpTools(host, { fetch: fakeFetch });
    const search = tools.find((item) => item.name === "web_search");
    expect(search).toBeDefined();
    const mcpResult = await search!.handler({ query: "bun runtime" });
    expect(mcpResult.isError).toBeUndefined();
    expect(JSON.stringify(mcpResult.content)).toContain("Bun is fast");

    const direct = await callAvenToolResult("web_search", { query: "aven" }, host, {
      fetch: fakeFetch,
    });
    expect(direct.isError).toBe(false);
    expect(direct.text).toContain("https://bun.sh");
    expect(requests).toHaveLength(2);
    expect(requests[0]?.auth).toBe("Bearer tvly-secret-key");
    expect(requests[0]?.body).toContain("bun runtime");
  });

  test("calls tool.definition once per catalog tool and preserves JSON schema", async () => {
    let definitions = 0;
    const base = createTool({
      name: "read_note",
      description: "Read a note",
      inputSchema: z.object({
        path: z.string().describe("File path"),
        lines: z.number().optional(),
      }),
      async handler() {
        return "ok";
      },
    });
    const counted = {
      ...base,
      definition: async (model: string) => {
        definitions += 1;
        return base.definition(model);
      },
    };
    const tools = await backendMcpTools({ catalog: [counted], questions: false });
    expect(definitions).toBe(1);
    expect(tools[0]?.inputSchema).toMatchObject({
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        lines: { type: "number" },
      },
      required: ["path"],
    });
  });

  test("converts Zod shapes to JSON schema with primitive, array and object types", () => {
    const schema = mcpInputSchema({
      query: z.string().describe("Search query"),
      tags: z.array(z.string()).optional(),
      options: z.object({ exact: z.boolean() }).optional(),
    });
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        tags: { type: "array", items: { type: "string" } },
        options: {
          type: "object",
          properties: { exact: { type: "boolean" } },
          required: ["exact"],
        },
      },
      required: ["query"],
      additionalProperties: true,
    });
  });

  test("turns rich ToolOutput.content image files into MCP image content blocks", async () => {
    const viewImage = createTool({
      name: "view_image",
      description: "View an image",
      inputSchema: z.object({ path: z.string() }),
      async handler({ path }) {
        return ToolOutput.content([
          { type: "text", text: `${path} (image/png, 4 bytes)` },
          {
            type: "file",
            data: { type: "data", data: "QUJDRA==" },
            mediaType: "image/png",
            filename: "shot.png",
          },
        ]);
      },
    });
    const tools = await backendMcpTools({ catalog: [viewImage], questions: false });
    const result = await tools[0]!.handler({ path: "shot.png" });
    expect(result).toEqual({
      content: [
        { type: "text", text: "shot.png (image/png, 4 bytes)" },
        { type: "image", data: "QUJDRA==", mimeType: "image/png" },
      ],
    });
  });
});
