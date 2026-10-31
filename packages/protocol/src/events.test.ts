import { describe, expect, test } from "bun:test";

import {
  SUBAGENT_TOOLS_KEPT,
  applyEvent,
  isRunning,
  mentionToken,
  type ChatMessage,
  type RunEvent,
} from "./events";

type Fixture = {
  name: string;
  events: RunEvent[];
  expected: { messages: ChatMessage[]; running: boolean };
};

// The same fixtures drive the Swift client's tests (clients/macos), so the two reducers cannot
// drift apart without one of the suites failing.
const fixtures: Fixture[] = await Bun.file(
  new URL("../fixtures/reducer.json", import.meta.url),
).json();

describe("applyEvent", () => {
  for (const fixture of fixtures) {
    test(fixture.name, () => {
      let messages: ChatMessage[] = [];
      let running = false;
      for (const event of fixture.events) {
        messages = applyEvent(messages, event);
        running = isRunning(running, event);
      }
      expect({ messages, running }).toEqual(fixture.expected);
    });
  }
});

describe("applyEvent with blank text", () => {
  // Some models open each step with blank text before a tool call (kept out of the shared fixtures,
  // which the Swift client also runs).
  test("blank text before a tool call is not a part, so the calls stay together", () => {
    const tool = (id: string) => ({
      id,
      name: "read_file",
      target: id,
      status: "running" as const,
    });
    const events: RunEvent[] = [
      { type: "run_start", prompt: "go" },
      { type: "text", delta: "\n\n" },
      { type: "tool_start", tool: tool("a") },
      { type: "text", delta: "\n\n" },
      { type: "tool_start", tool: tool("b") },
      { type: "text", delta: "Done" },
      { type: "text", delta: "\n\n" },
    ];
    const [, assistant] = events.reduce(applyEvent, [] as ChatMessage[]);
    expect(assistant?.parts).toEqual([
      { type: "tool", tool: tool("a") },
      { type: "tool", tool: tool("b") },
      { type: "text", text: "Done\n\n" },
    ]);
  });
});

describe("applyEvent with attachments", () => {
  test("a message's files go on the user message, and a message without any has none", () => {
    const attachments = [
      { name: "chart.png", mediaType: "image/png", size: 10, image: "a.png" },
      { name: "deck.pptx", mediaType: "application/octet-stream", size: 20 },
    ];
    const events: RunEvent[] = [
      { type: "run_start", prompt: "", attachments },
      { type: "done" },
      { type: "run_start", prompt: "again" },
    ];
    const [first, , second] = events.reduce(applyEvent, [] as ChatMessage[]);
    expect(first).toMatchObject({ role: "user", attachments });
    expect(second?.role).toBe("user");
    expect(second && "attachments" in second).toBe(false);
  });
});

describe("applyEvent with mentions", () => {
  test("a message's mentions go on the user message", () => {
    const mentions = [{ type: "file" as const, name: "a.ts", from: 0, to: 5 }];
    const events: RunEvent[] = [
      { type: "run_start", prompt: "@a.ts", mentions },
      { type: "done" },
      { type: "run_start", prompt: "again" },
    ];
    const [first, , second] = events.reduce(applyEvent, [] as ChatMessage[]);
    expect(first).toMatchObject({ role: "user", mentions });
    expect(second && "mentions" in second).toBe(false);
  });

  test("a mention's token is its sign and its name", () => {
    expect(mentionToken({ type: "file", name: "src/a.ts" })).toBe("@src/a.ts");
    expect(mentionToken({ type: "skill", name: "notes" })).toBe("/notes");
  });
});

describe("applyEvent with subagents", () => {
  const spawn = (): RunEvent => ({
    type: "tool_start",
    tool: {
      id: "s1",
      name: "spawn_agent",
      target: "2 tasks",
      status: "running",
      subagents: [
        { index: 0, description: "Find auth", type: "explore", status: "running", tools: [] },
        { index: 1, description: "Write a test", type: "general", status: "running", tools: [] },
      ],
    },
  });
  const run = (...events: RunEvent[]) =>
    events
      .reduce(applyEvent, [] as ChatMessage[])
      .at(-1)
      ?.parts.at(-1);
  const subagents = (part: ReturnType<typeof run>) =>
    part?.type === "tool" ? part.tool.subagents : undefined;
  const read = (id: string): RunEvent => ({
    type: "subagent",
    index: 1,
    event: { type: "tool_start", tool: { id, name: "read_file", target: id, status: "running" } },
  });

  test("a subagent's tool calls go under it, and no other subagent's", () => {
    const part = run({ type: "run_start", prompt: "go" }, spawn(), read("a.ts"), {
      type: "subagent",
      index: 1,
      event: { type: "tool_end", id: "a.ts", status: "done" },
    });
    expect(subagents(part)?.[0]?.tools).toEqual([]);
    expect(subagents(part)?.[1]?.tools).toEqual([
      { id: "a.ts", name: "read_file", target: "a.ts", status: "done" },
    ]);
  });

  test("a subagent ends on its own, while the call and the others go on", () => {
    const part = run({ type: "run_start", prompt: "go" }, spawn(), {
      type: "subagent",
      index: 0,
      event: { type: "end", status: "done", output: "It is in src/a.ts" },
    });
    expect(subagents(part)?.map(({ status }) => status)).toEqual(["done", "running"]);
    expect(subagents(part)?.[0]?.output).toBe("It is in src/a.ts");
    expect(part?.type === "tool" && part.tool.status).toBe("running");
  });

  test("a subagent keeps only its latest tool calls", () => {
    const calls = Array.from({ length: SUBAGENT_TOOLS_KEPT + 5 }, (_, i) => read(`f${i}`));
    const part = run({ type: "run_start", prompt: "go" }, spawn(), ...calls);
    const tools = subagents(part)?.[1]?.tools;
    expect(tools).toHaveLength(SUBAGENT_TOOLS_KEPT);
    expect(tools?.[0]?.id).toBe("f5");
  });

  test("a call that fails ends the subagents still working, and keeps those that finished", () => {
    const part = run(
      { type: "run_start", prompt: "go" },
      spawn(),
      { type: "subagent", index: 0, event: { type: "end", status: "done", output: "ok" } },
      { type: "tool_end", id: "s1", status: "error", output: "cancelled" },
    );
    expect(subagents(part)?.map(({ status }) => status)).toEqual(["done", "error"]);
  });

  test("an event for a call that is not running changes nothing", () => {
    const before = [spawn(), { type: "tool_end", id: "s1", status: "done" } as const].reduce(
      applyEvent,
      applyEvent([], { type: "run_start", prompt: "go" }),
    );
    expect(applyEvent(before, read("late"))).toEqual(before);
  });
});
