import { describe, expect, test } from "bun:test";
import { createTool, type Message, type MemoryStore } from "@anvia/core";
import { z } from "zod";

import { BOT_COMPUTER_MAX_TURNS, BOT_MAX_TURNS, createBotAgent } from "./bot-agent";
import { TYPING_MAX_MS, TYPING_MIN_MS, typingDelay } from "./bot-delay";
import { botInstructions } from "./bot-instruction";
import { scriptedModel, text, toolCall } from "./testing/scripted-model";
import { CREATE_BOT_TOOL_NAME } from "./tools/create-bot";
import { SEND_MESSAGE_TOOL_NAME } from "./tools/send-message";
import { UPDATE_SELF_TOOL_NAME } from "./tools/update-self";

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

  test("says it only talks, until it has a computer, and then says what the computer is", () => {
    const talking = botInstructions({ name: "Pip", instruction: "" });
    expect(talking).toContain("you have no files, commands or internet");
    expect(talking).not.toContain("<computer>");

    const working = botInstructions({ name: "Pip", instruction: "", computer: true });
    expect(working).toContain("You have a computer of your own");
    expect(working).toContain("<computer>");
    expect(working).not.toContain("no files, commands or internet");
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

  test("a computer's tools come after send_message, and give the bot more turns to work in", async () => {
    const lookup = createTool({
      name: "run_it",
      description: "Runs something on the computer.",
      inputSchema: z.object({}),
      execute: async () => "42",
    });
    const delivered: string[] = [];
    const agent = createBotAgent({
      ...base,
      model: scriptedModel([[toolCall("run_it", {})], [send("it came to 42")], [text("")]]),
      deliver: async (message) => void delivered.push(message),
      memory: { store: fakeStore(), savePolicy: "turn" },
      computer: [lookup],
    });
    expect(agent.tools.map((tool) => tool.name)).toEqual([SEND_MESSAGE_TOOL_NAME, "run_it"]);

    await agent.generate({ prompt: "what is it?", session: { sessionId: "b1" } });
    expect(delivered).toEqual(["it came to 42"]);
    expect(agent.defaultMaxTurns).toBe(BOT_COMPUTER_MAX_TURNS);
  });

  test("a bot with no computer keeps the short limit on turns", () => {
    const agent = createBotAgent({
      ...base,
      model: scriptedModel([]),
      deliver: async () => undefined,
      memory: { store: fakeStore(), savePolicy: "turn" },
    });
    expect(agent.defaultMaxTurns).toBe(BOT_MAX_TURNS);
  });

  test("a bot that may make bots has the tool, and is told when to use it; any other has neither", async () => {
    const made: string[] = [];
    const maker = createBotAgent({
      ...base,
      model: scriptedModel([
        [toolCall(CREATE_BOT_TOOL_NAME, { name: "Scout", instruction: "You research." })],
        [send("Scout is ready")],
        [text("")],
      ]),
      deliver: async () => undefined,
      memory: { store: fakeStore(), savePolicy: "turn" },
      createBot: async ({ name }) => (made.push(name), { name }),
    });
    expect(maker.tools.map((tool) => tool.name)).toEqual([
      SEND_MESSAGE_TOOL_NAME,
      CREATE_BOT_TOOL_NAME,
    ]);
    await maker.generate({ prompt: "make me a research bot", session: { sessionId: "b1" } });
    expect(made).toEqual(["Scout"]);

    const plain = createBotAgent({
      ...base,
      model: scriptedModel([]),
      deliver: async () => undefined,
      memory: { store: fakeStore(), savePolicy: "turn" },
    });
    expect(plain.tools.map((tool) => tool.name)).toEqual([SEND_MESSAGE_TOOL_NAME]);
    expect(botInstructions({ ...base, createBots: true })).toContain(CREATE_BOT_TOOL_NAME);
    expect(botInstructions(base)).not.toContain(CREATE_BOT_TOOL_NAME);
  });

  test("a person who asks for two bots gets two in the one reply", async () => {
    const made: string[] = [];
    const agent = createBotAgent({
      ...base,
      model: scriptedModel([
        [
          toolCall(CREATE_BOT_TOOL_NAME, { name: "Analyst", instruction: "You analyse data." }),
          toolCall(CREATE_BOT_TOOL_NAME, { name: "Scout", instruction: "You research." }),
        ],
        [send("Both are ready")],
        [text("")],
      ]),
      deliver: async () => undefined,
      memory: { store: fakeStore(), savePolicy: "turn" },
      createBot: async ({ name }) => (made.push(name), { name }),
    });

    await agent.generate({ prompt: "make me two bots", session: { sessionId: "b1" } });

    expect(made).toEqual(["Analyst", "Scout"]);
    expect(botInstructions({ ...base, createBots: true })).not.toContain("only one for each");
  });

  test("a bot given a way to change itself has the tool, and is told its description and when to use it", async () => {
    const changes: unknown[] = [];
    const agent = createBotAgent({
      ...base,
      description: "Looks things up.",
      model: scriptedModel([
        [toolCall(UPDATE_SELF_TOOL_NAME, { name: "Scout" })],
        [send("Call me Scout")],
        [text("")],
      ]),
      deliver: async () => undefined,
      memory: { store: fakeStore(), savePolicy: "turn" },
      updateSelf: async (change) => (changes.push(change), { name: "Scout", description: "" }),
    });
    expect(agent.tools.map((tool) => tool.name)).toEqual([
      SEND_MESSAGE_TOOL_NAME,
      UPDATE_SELF_TOOL_NAME,
    ]);
    await agent.generate({ prompt: "call yourself Scout", session: { sessionId: "b1" } });
    expect(changes).toEqual([{ name: "Scout" }]);

    const told = botInstructions({ ...base, self: { description: "Looks things up." } });
    expect(told).toContain("<yourself>");
    expect(told).toContain("Your description now: Looks things up.");
    expect(botInstructions({ ...base, self: { description: "" } })).not.toContain(
      "description now",
    );
    expect(botInstructions(base)).not.toContain(UPDATE_SELF_TOOL_NAME);
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
