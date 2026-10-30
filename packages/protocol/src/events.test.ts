import { describe, expect, test } from "bun:test";

import { applyEvent, isRunning, type ChatMessage, type RunEvent } from "./events";

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
