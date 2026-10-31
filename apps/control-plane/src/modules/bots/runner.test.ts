import { describe, expect, test } from "bun:test";
import type { MemoryStore, Message } from "@anvia/core";
import { createBotAgent } from "@aven/agents/bot-agent";
import { typingDelay } from "@aven/agents/bot-delay";
import { botMessagesToChat } from "@aven/agents/bot-projection";
import type { ModelConfig } from "@aven/agents/model";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import type { Bot, BotEvent } from "@aven/protocol/bots";

import { ConflictError, UnavailableError } from "../../errors";
import { BotRunner, type CreateBotAgent } from "./runner";

const USER = "u1";
const model: ModelConfig = { provider: "openai" };
const bot: Bot = {
  id: "b1",
  name: "Pip",
  instruction: "",
  avatar: "",
  providerId: null,
  modelId: null,
  reasoningEffort: null,
  compactAfterTokens: null,
  isMain: true,
  createdAt: "",
  updatedAt: "",
};

const send = (message: string) => toolCall("send_message", { text: message });

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

// The agent of each message in turn plays the next script.
function scripts(...replies: Parameters<typeof scriptedModel>[0][]): CreateBotAgent {
  let next = 0;
  return ({ bot, deliver, memory }) =>
    createBotAgent({
      model: scriptedModel(replies[next++] ?? []),
      id: bot.id,
      name: bot.name,
      instruction: bot.instruction,
      deliver,
      memory,
    });
}

const until = async (condition: () => boolean) => {
  for (let tries = 0; !condition(); tries++) {
    if (tries > 2000) throw new Error("timed out");
    await Bun.sleep(1);
  }
};

// A client attached to the bot's events, stopped by `stop` or by `close`.
async function watch(runner: BotRunner, stop: (events: BotEvent[]) => boolean = () => false) {
  const controller = new AbortController();
  const events: BotEvent[] = [];
  const done = (async () => {
    for await (const event of runner.events(bot.id, USER, controller.signal)) {
      if (!event) continue;
      events.push(event);
      if (stop(events)) controller.abort();
    }
  })();
  await until(() => events.length > 0);
  return { events, done, close: () => controller.abort() };
}

const typed = (events: BotEvent[]) =>
  events.map((event) => {
    if (event.type === "message") return `${event.message.role}: ${event.message.text}`;
    if (event.type === "typing") return event.typing ? "typing" : "stopped";
    return event.type;
  });

const stopped = (events: BotEvent[]) =>
  events.some((event) => event.type === "typing" && !event.typing);

describe("BotRunner", () => {
  test("the bot's messages come one after another, each after a pause worked out from it", async () => {
    const pauses: number[] = [];
    const runner = new BotRunner({
      store: fakeStore(),
      createAgent: scripts([[send("hey"), send("how was your day, my friend?")], [text("")]]),
      pause: async (ms) => void pauses.push(ms),
    });
    const client = await watch(runner, stopped);
    await runner.send(bot, USER, "hello", model);
    await client.done;

    expect(typed(client.events)).toEqual([
      "snapshot",
      "user: hello",
      "typing",
      "bot: hey",
      "bot: how was your day, my friend?",
      "stopped",
    ]);
    expect(pauses).toEqual([typingDelay("hey"), typingDelay("how was your day, my friend?")]);
  });

  test("messages the model sends in one turn are typed one at a time", async () => {
    let typing = 0;
    let most = 0;
    const runner = new BotRunner({
      store: fakeStore(),
      createAgent: scripts([[send("one"), send("two"), send("three")], [text("")]]),
      pause: async () => {
        typing += 1;
        most = Math.max(most, typing);
        await Bun.sleep(2);
        typing -= 1;
      },
    });
    const client = await watch(runner, stopped);
    await runner.send(bot, USER, "hello", model);
    await client.done;
    expect(most).toBe(1);
    expect(typed(client.events).slice(3, 6)).toEqual(["bot: one", "bot: two", "bot: three"]);
  });

  test("a message that comes while the bot is at work waits its turn", async () => {
    const store = fakeStore();
    const gates: (() => void)[] = [];
    const runner = new BotRunner({
      store,
      createAgent: scripts([[send("one")], [text("")]], [[send("two")], [text("")]]),
      pause: () => new Promise<void>((resolve) => gates.push(resolve)),
    });
    const client = await watch(runner, stopped);

    await runner.send(bot, USER, "first", model);
    await until(() => gates.length === 1);
    await runner.send(bot, USER, "second", model);
    // The person's second message is in the chat at once; the bot has said nothing yet.
    await until(() => client.events.length === 4);
    expect(typed(client.events)).toEqual(["snapshot", "user: first", "typing", "user: second"]);

    // Its reply has not begun: the bot is still on the first.
    await Bun.sleep(5);
    expect(gates.length).toBe(1);

    gates[0]!();
    await until(() => gates.length === 2);
    gates[1]!();
    await client.done;

    expect(typed(client.events).slice(4)).toEqual(["bot: one", "bot: two", "stopped"]);
    // What the bot remembers is in the order it was said.
    const history = botMessagesToChat(await store.load({ scope: { sessionId: bot.id } }));
    expect(history.map((message) => message.text)).toEqual(["first", "one", "second", "two"]);

    // A client that comes later, and a runner started afresh, both find the chat from the store.
    const later = new BotRunner({ store });
    const fresh = await watch(later);
    fresh.close();
    await fresh.done;
    const [snapshot] = fresh.events;
    expect(snapshot).toMatchObject({ type: "snapshot", typing: false });
    expect(snapshot?.type === "snapshot" && snapshot.messages.map((m) => m.text)).toEqual([
      "first",
      "one",
      "second",
      "two",
    ]);
  });

  test("a client that connects mid-reply gets the chat so far and whether the bot is typing", async () => {
    const gates: (() => void)[] = [];
    const runner = new BotRunner({
      store: fakeStore(),
      createAgent: scripts([[send("one"), send("two")], [text("")]]),
      pause: () => new Promise<void>((resolve) => gates.push(resolve)),
    });
    await runner.send(bot, USER, "hi", model);
    await until(() => gates.length === 1);
    gates[0]!();
    await until(() => gates.length === 2);

    const late = await watch(runner, stopped);
    expect(late.events[0]).toMatchObject({ type: "snapshot", typing: true });
    expect(typed(late.events)).toEqual(["snapshot"]);
    gates[1]!();
    await late.done;
    expect(typed(late.events)).toEqual(["snapshot", "bot: two", "stopped"]);
  });

  test("a reply that fails is told to the clients, and the next one goes on", async () => {
    let fail: () => void = () => undefined;
    const failing = new Promise<void>((resolve) => (fail = resolve));
    const next = scripts([[send("back")], [text("")]]);
    const runner = new BotRunner({
      store: fakeStore(),
      createAgent: (input) =>
        input.bot.name === "Pip"
          ? {
              generate: async () => {
                await failing;
                throw new Error("the model is down");
              },
            }
          : next(input),
      pause: async () => undefined,
    });
    const client = await watch(runner, stopped);
    await runner.send(bot, USER, "hello", model);
    await runner.send({ ...bot, name: "Other" }, USER, "again", model);
    fail();
    await client.done;

    expect(typed(client.events)).toEqual([
      "snapshot",
      "user: hello",
      "typing",
      "user: again",
      "error",
      "bot: back",
      "stopped",
    ]);
    expect(client.events.find((event) => event.type === "error")).toEqual({
      type: "error",
      message: "the model is down",
    });
  });

  test("a bot that owes too many replies is not given more", async () => {
    const runner = new BotRunner({
      store: fakeStore(),
      createAgent: scripts(...Array.from({ length: 6 }, () => [[send("x")], [text("")]])),
      pause: () => new Promise<void>(() => undefined),
    });
    const client = await watch(runner);
    for (let sent = 0; sent < 5; sent++) await runner.send(bot, USER, `message ${sent}`, model);
    await expect(runner.send(bot, USER, "one more", model)).rejects.toBeInstanceOf(ConflictError);
    await until(() => client.events.length === 7);
    // The refused message is not in the chat.
    expect(typed(client.events).filter((entry) => entry.startsWith("user:"))).toHaveLength(5);
    client.close();
  });

  test("a chat nobody is watching when its reply ends is dropped, and read again when asked for", async () => {
    const store = fakeStore();
    let reads = 0;
    const counting: MemoryStore = {
      ...store,
      load: async (options) => {
        reads += 1;
        return store.load(options);
      },
    };
    const gates: (() => void)[] = [];
    let ended: () => void = () => undefined;
    const replyEnded = new Promise<void>((resolve) => (ended = resolve));
    const makeAgent = scripts([[send("hi")], [text("")]]);
    const runner = new BotRunner({
      store: counting,
      createAgent: (input) => {
        const agent = makeAgent(input);
        return { generate: (...args) => agent.generate(...args).finally(ended) };
      },
      pause: () => new Promise<void>((resolve) => gates.push(resolve)),
    });

    const client = await watch(runner);
    await runner.send(bot, USER, "hello", model);
    await until(() => gates.length === 1);
    // The client leaves while the bot is still at work; the reply goes on without it.
    client.close();
    await client.done;
    gates[0]!();
    await replyEnded;
    await Bun.sleep(1);

    reads = 0;
    const again = await watch(runner);
    expect(reads).toBe(1);
    expect(again.events[0]).toMatchObject({ type: "snapshot", typing: false });
    again.close();
  });

  test("a model that cannot be used is refused before anything is added", async () => {
    const runner = new BotRunner({
      store: fakeStore(),
      createAgent: () => {
        throw new Error("OPENAI_API_KEY is not set");
      },
    });
    const client = await watch(runner);
    await expect(runner.send(bot, USER, "hello", model)).rejects.toBeInstanceOf(UnavailableError);
    client.close();
    await client.done;
    expect(typed(client.events)).toEqual(["snapshot"]);
  });

  test("shutting down ends a reply without calling it a failure", async () => {
    const runner = new BotRunner({
      store: fakeStore(),
      createAgent: scripts([[send("never shown")], [text("")]]),
    });
    const client = await watch(runner, stopped);
    await runner.send(bot, USER, "hello", model);
    await until(() => client.events.some((event) => event.type === "typing"));
    runner.dispose();
    await client.done;
    expect(typed(client.events)).toEqual(["snapshot", "user: hello", "typing", "stopped"]);
  });
});
