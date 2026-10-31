import { describe, expect, test } from "bun:test";
import type { Message, MemoryStore } from "@anvia/core";

import { createBotAgent } from "./bot-agent";
import { TYPING_MAX_MS, TYPING_MIN_MS, typingDelay } from "./bot-delay";
import { botInstructions } from "./bot-instruction";
import { scriptedModel, text, toolCall } from "./testing/scripted-model";
import { SEND_MESSAGE_TOOL_NAME } from "./tools/send-message";

const send = (message: string) => toolCall(SEND_MESSAGE_TOOL_NAME, { text: message });

// A store that keeps each session's messages, as the control plane's does in Postgres.
function fakeStore(): MemoryStore {
  const sessions = new Map<string, Message[]>();
  return {
    load: async ({ scope }) => sessions.get(scope.sessionId) ?? [],
    append: async ({ scope, messages }) => {
      const kept = sessions.get(scope.sessionId) ?? [];
      kept.push(...messages);
      sessions.set(scope.sessionId, kept);
    },
    clear: async ({ scope }) => void sessions.delete(scope.sessionId),
  };
}

describe("typingDelay", () => {
  test("grows with the length of the message, within bounds", () => {
    expect(typingDelay("hi")).toBe(TYPING_MIN_MS);
    expect(typingDelay("a".repeat(40))).toBeGreaterThan(typingDelay("a".repeat(20)));
    expect(typingDelay("a".repeat(5000))).toBe(TYPING_MAX_MS);
  });

  test("does not count the spaces around a message", () => {
    expect(typingDelay(`   ${"a".repeat(30)}   `)).toBe(typingDelay("a".repeat(30)));
  });
});

describe("botInstructions", () => {
  test("names the bot and puts what the person asked for in its own section", () => {
    const instructions = botInstructions({ name: "Pip", instruction: "Talk like a pirate." });
    expect(instructions).toContain("You are Pip");
    expect(instructions).toContain("<persona>\nTalk like a pirate.\n</persona>");
    expect(instructions).toContain(SEND_MESSAGE_TOOL_NAME);
  });

  test("has no persona section when there is nothing to put in it", () => {
    expect(botInstructions({ name: "Pip", instruction: "  " })).not.toContain("<persona>");
  });
});

describe("createBotAgent", () => {
  const base = { id: "b1", name: "Pip", instruction: "" };

  test("has the one tool, and what it sends is delivered in order", async () => {
    const delivered: string[] = [];
    const agent = createBotAgent({
      ...base,
      model: scriptedModel([
        [send("hey!"), send("  how was your day?  ")],
        [text("this is never seen")],
      ]),
      deliver: async (message) => void delivered.push(message),
      memory: { store: fakeStore(), savePolicy: "turn" },
    });
    expect(agent.tools.map((tool) => tool.name)).toEqual([SEND_MESSAGE_TOOL_NAME]);

    const outcome = await agent.generate({
      prompt: "hello",
      session: { sessionId: "b1" },
    });
    expect(outcome.type).toBe("response");
    expect(delivered).toEqual(["hey!", "how was your day?"]);
  });

  test("remembers the conversation from one message to the next", async () => {
    const store = fakeStore();
    const seen: string[] = [];
    const agent = createBotAgent({
      ...base,
      model: scriptedModel([
        [send("hi")],
        [text("")],
        (request) => {
          seen.push(JSON.stringify(request.chatHistory));
          return [send("still here")];
        },
        [text("")],
      ]),
      deliver: async () => undefined,
      memory: { store, savePolicy: "turn" },
    });
    await agent.generate({ prompt: "my name is Ana", session: { sessionId: "b1" } });
    await agent.generate({ prompt: "who am I?", session: { sessionId: "b1" } });
    expect(seen[0]).toContain("my name is Ana");
  });

  test("a cancelled delivery stops the run", async () => {
    const controller = new AbortController();
    const agent = createBotAgent({
      ...base,
      model: scriptedModel([[send("one")], [send("two")]]),
      deliver: async (_message, { abortSignal }) => {
        controller.abort();
        abortSignal?.throwIfAborted();
      },
      memory: { store: fakeStore(), savePolicy: "turn" },
    });
    await expect(
      agent.generate({
        prompt: "hello",
        session: { sessionId: "b1" },
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
