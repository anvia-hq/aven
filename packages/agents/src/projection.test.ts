import { describe, expect, test } from "bun:test";
import { createTool } from "@anvia/core";
import { z } from "zod";

import { createCodingAgent } from "./coding-agent";
import { messagesToChat, projectStreamEvent, projectSubagentEvent } from "./projection";
import {
  applyEvent,
  pendingQuestion,
  questionAnswers,
  type ChatMessage,
  type RunEvent,
} from "@aven/protocol/events";
import { scriptedModel, text, toolCall } from "./testing/scripted-model";
import { createEditTool } from "./tools/edit";
import { createSpawnAgentTool } from "./tools/spawn-agent";
import { usageFromHistory } from "./usage";

// Stand-ins for the sandbox's tools: they return what @anvia/sandbox's tools return.
const files = new Map([["a.txt", "hello"]]);

const readFile = createTool({
  name: "read_file",
  description: "Reads a file.",
  inputSchema: z.object({ path: z.string() }),
  execute: ({ path }) => {
    const content = files.get(path);
    if (content === undefined) throw new Error(`File not found: ${path}`);
    return { content, startLine: 1, endLine: 1, nextStartLine: null, truncated: false };
  },
});

const edit = createEditTool({
  workdir: "/workspace",
  readTextFile: async ({ path }) => files.get(path) ?? "",
  writeTextFile: async ({ path, text }) => void files.set(path, text),
});

async function run(prompt: string) {
  files.set("a.txt", "hello");
  const { agent } = createCodingAgent({
    tools: [readFile, edit],
    webSearch: false,
    model: scriptedModel([
      [text("Let me look."), toolCall("read_file", { path: "a.txt" }, "c1")],
      [
        toolCall("edit", { path: "a.txt", oldString: "hello", newString: "bye" }, "c2"),
        toolCall("read_file", { path: "missing.txt" }, "c3"),
      ],
      [text("All done.")],
    ]),
  });
  const stream = agent.stream({ prompt });
  const events: RunEvent[] = [];
  for await (const event of stream) {
    const projected = projectStreamEvent(event);
    if (projected) events.push(projected);
  }
  return { events, outcome: await stream.result };
}

describe("projection", () => {
  test("projects only text, tool and usage events, with one usage per model call", async () => {
    const { events: all } = await run("go");
    expect(all.filter((event) => event.type === "usage")).toHaveLength(3);
    const events = all.filter((event) => event.type !== "usage");
    expect(events.map((event) => event.type)).toEqual([
      "text",
      "tool_start",
      "tool_end",
      "tool_start",
      "tool_start",
      "tool_end",
      "tool_end",
      "text",
    ]);
  });

  test("tool events carry target, diff and a human-readable output", async () => {
    const { events } = await run("go");
    const starts = events.filter((event) => event.type === "tool_start");
    expect(starts[0]).toMatchObject({
      tool: { name: "read_file", target: "a.txt", status: "running" },
    });
    expect(starts[1]).toMatchObject({
      tool: {
        name: "edit",
        diff: [
          { type: "del", text: "hello" },
          { type: "add", text: "bye" },
        ],
      },
    });
    const ends = events.filter((event) => event.type === "tool_end");
    expect(ends[0]).toMatchObject({ id: "c1", status: "done" });
    expect((ends[0] as { output: string }).output).toBe("hello");
    // A failing tool is reported as an error the model can see, and does not end the run.
    expect(ends.find((end) => end.id === "c3")).toMatchObject({ status: "error" });
  });

  test("applying events rebuilds the same transcript as the stored history", async () => {
    const { events, outcome } = await run("go");
    const live = [{ type: "run_start", prompt: "go" } as const, ...events].reduce<ChatMessage[]>(
      applyEvent,
      [],
    );
    const stored = messagesToChat(outcome.messages);
    expect(live).toHaveLength(2);
    expect(live[1]!.parts.map((part) => part.type)).toEqual([
      "text",
      "tool",
      "tool",
      "tool",
      "text",
    ]);
    expect(stored.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(stored[1]).toEqual({ ...live[1]!, id: stored[1]!.id });
  });
});

describe("usage", () => {
  const usage = {
    inputTokens: 4917,
    outputTokens: 49,
    totalTokens: 4966,
    cachedInputTokens: 4209,
    cacheCreationInputTokens: 704,
  };
  const turnEnd = (contextUsage?: object) =>
    ({ type: "turn_end", turn: 1, response: { choice: [], usage, contextUsage } }) as never;
  const context = {
    usedTokens: 4917,
    remainingTokens: 995_083,
    usedPercent: 0.4917,
    remainingPercent: 99.5083,
    model: { modelId: "m", context: { contextWindow: 1_000_000 } },
  };

  test("a model call becomes a usage event: the whole input, with the cache parts of it", () => {
    const event = projectStreamEvent(turnEnd(context));
    expect(event).toEqual({
      type: "usage",
      turn: { inputTokens: 4917, outputTokens: 49, cacheWriteTokens: 704, cacheReadTokens: 4209 },
      context: { usedTokens: 4917, contextWindow: 1_000_000 },
    });
  });

  test("a model whose window is unknown still reports tokens, without context", () => {
    expect(projectStreamEvent(turnEnd())).toMatchObject({ type: "usage", context: undefined });
  });

  test("a thread's usage is read back from the stored messages", () => {
    const generation = { usage, modelId: "m", provider: "anthropic", contextUsage: context };
    const stored = (text: string) =>
      ({ role: "assistant", content: text, metadata: { anvia: { generation } } }) as never;
    expect(usageFromHistory([{ role: "user", content: "hi" }, stored("a"), stored("b")])).toEqual({
      totals: {
        inputTokens: 9834,
        outputTokens: 98,
        cacheWriteTokens: 1408,
        cacheReadTokens: 8418,
      },
      context: { usedTokens: 4917, contextWindow: 1_000_000 },
    });
  });
});

describe("questions", () => {
  const asked = {
    id: "color",
    text: "Which color?",
    choices: [
      { label: "Red", value: "red" },
      { label: "Blue", value: "blue" },
    ],
    allowCustom: true,
  };
  const call = {
    type: "tool-call",
    toolCallId: "q1",
    toolName: "ask_user",
    input: { questions: [asked] },
  } as const;

  test("an ask_user call carries its questions to clients", () => {
    const event = projectStreamEvent({ type: "tool_call", toolCall: call } as never);
    expect(event).toMatchObject({
      type: "tool_start",
      tool: { name: "ask_user", questions: [asked] },
    });
  });

  test("a request_secret call carries its questions, and a stored one is pending until it is answered", () => {
    const secret = { id: "STRIPE_API_KEY", text: "What is the Stripe API key for testing?" };
    const request = {
      type: "tool-call",
      toolCallId: "s1",
      toolName: "request_secret",
      input: { questions: [secret] },
    } as const;

    expect(projectStreamEvent({ type: "tool_call", toolCall: request } as never)).toMatchObject({
      type: "tool_start",
      tool: { name: "request_secret", questions: [secret] },
    });
    const pending = messagesToChat([
      { role: "user", content: "set up stripe" },
      { role: "assistant", content: [request] },
    ]);
    expect(pendingQuestion(pending)?.questions).toEqual([secret]);
  });

  test("blank text before a tool call is not a part, so the calls stay together", () => {
    const read = (id: string) =>
      ({ type: "tool-call", toolCallId: id, toolName: "read_file", input: { path: id } }) as const;
    const chat = messagesToChat([
      { role: "user", content: "look" },
      { role: "assistant", content: [{ type: "text", text: "\n\n" }, read("a")] },
      { role: "assistant", content: [{ type: "text", text: "\n\n" }, read("b")] },
    ]);
    expect(chat[1]?.parts.map((part) => part.type)).toEqual(["tool", "tool"]);
  });

  test("a stored question without a result is pending, and with one it is answered", () => {
    const pending = messagesToChat([
      { role: "user", content: "paint it" },
      { role: "assistant", content: [call] },
    ]);
    const tool = pendingQuestion(pending);
    expect(tool?.questions).toEqual([asked]);

    const answered = messagesToChat([
      { role: "user", content: "paint it" },
      { role: "assistant", content: [call] },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "q1",
            toolName: "ask_user",
            output: { type: "json", value: { answers: [{ questionId: "color", value: "red" }] } },
          },
        ],
      },
    ]);
    expect(pendingQuestion(answered)).toBeUndefined();
    const part = answered[1]?.parts[0];
    expect(part?.type === "tool" && questionAnswers(part.tool)).toEqual([
      { questionId: "color", value: "red" },
    ]);
  });

  test("malformed questions are left out", () => {
    const event = projectStreamEvent({
      type: "tool_call",
      toolCall: { ...call, input: { questions: [{ id: 1 }, { id: "ok", text: "Fine?" }] } },
    } as never);
    expect(event).toMatchObject({ tool: { questions: [{ id: "ok", text: "Fine?" }] } });
  });
});

describe("subagents", () => {
  test("a subagent's stream tells a client its tools and its usage, not its text", async () => {
    const { agent } = createCodingAgent({
      tools: [readFile],
      webSearch: false,
      questions: false,
      model: scriptedModel([
        [text("Looking."), toolCall("read_file", { path: "a.txt" }, "c1")],
        [text("It says hello.")],
      ]),
    });
    const stream = agent.stream({ prompt: "look" });
    const events: RunEvent[] = [];
    for await (const event of stream) {
      const projected = projectSubagentEvent(event, 2);
      if (projected) events.push(projected);
    }
    expect(events.map((event) => event.type)).toEqual(["subagent", "usage", "subagent", "usage"]);
    expect(events[0]).toEqual({
      type: "subagent",
      index: 2,
      event: {
        type: "tool_start",
        tool: { id: "c1", name: "read_file", target: "a.txt", status: "running" },
      },
    });
    expect(events[2]).toEqual({
      type: "subagent",
      index: 2,
      event: { type: "tool_end", id: "c1", status: "done" },
    });
    // What its model calls used counts toward the thread; the context is the agent's own.
    for (const usage of events.filter((event) => event.type === "usage"))
      expect(usage).not.toHaveProperty("context");
  });

  test("a stored transcript shows how each subagent ended", async () => {
    const spawn = createSpawnAgentTool(async ({ description }) => {
      if (description === "bad") throw new Error("no model");
      return "src/auth.ts";
    });
    const { agent } = createCodingAgent({
      tools: [spawn],
      webSearch: false,
      questions: false,
      model: scriptedModel([
        [
          {
            type: "tool-call",
            toolCallId: "s1",
            toolName: "spawn_agent",
            input: {
              tasks: [
                { description: "good", prompt: "p", type: "explore" },
                { description: "bad", prompt: "q", type: "general" },
              ],
            },
          },
        ],
        [text("Done")],
      ]),
    });
    const stream = agent.stream({ prompt: "go" });
    for await (const _event of stream);
    const part = messagesToChat((await stream.result).messages)[1]?.parts[0];
    if (part?.type !== "tool") throw new Error("expected the tool call");
    expect(part.tool).toMatchObject({ name: "spawn_agent", status: "done", target: "2 tasks" });
    expect(part.tool.output).toBe("1 finished, 1 failed");
    expect(
      part.tool.subagents?.map(({ description, status, output }) => [description, status, output]),
    ).toEqual([
      ["good", "done", "src/auth.ts"],
      ["bad", "error", "no model"],
    ]);
  });
});
