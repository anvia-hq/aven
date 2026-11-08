import { describe, expect, test } from "bun:test";
import type { MemoryStore, Message } from "@anvia/core";
import { createBotAgent } from "@aven/agents/bot-agent";
import { typingDelay } from "@aven/agents/bot-delay";
import { botMessagesToChat } from "@aven/agents/bot-projection";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import { parseBotPrompt } from "@aven/protocol/bots";

import { ConflictError, UnavailableError } from "../../errors";
import { BotRunner } from "./runner";
import { inProcessReplier } from "./testing/in-process-replier";
import type { BotReplier, BotReplyInput, CreateBotAgent } from "./types";
import type { ModelConfig } from "@aven/agents/types";
import type { Bot, BotEvent, RunAttachment } from "@aven/protocol/types";

const USER = "u1";
const model: ModelConfig = { provider: "openai" };
const bot: Bot = {
  id: "b1",
  name: "Pip",
  handle: "main",
  instruction: "",
  description: "",
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

function scripts(...replies: Parameters<typeof scriptedModel>[0][]): CreateBotAgent {
  let next = 0;
  return ({ bot, send, memory }) =>
    createBotAgent({
      model: scriptedModel(replies[next++] ?? []),
      id: bot.id,
      name: bot.name,
      handle: bot.handle,
      peers: [],
      instruction: bot.instruction,
      send,
      memory,
    });
}

const runnerWith = (options: {
  store: MemoryStore;
  createAgent?: CreateBotAgent;
  pause?: (ms: number, signal?: AbortSignal) => Promise<void>;
}) =>
  new BotRunner({
    store: options.store,
    replier: inProcessReplier({
      store: options.store,
      createAgent: options.createAgent ?? scripts(),
      pause: options.pause,
    }),
  });

const until = async (condition: () => boolean) => {
  for (let tries = 0; !condition(); tries++) {
    if (tries > 2000) throw new Error("timed out");
    await Bun.sleep(1);
  }
};

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
  test("a message with files shows them in the chat without their bytes, and the reply is given the bytes (decision 0080)", async () => {
    const answered: BotReplyInput[] = [];
    const replier: BotReplier = {
      ready: () => undefined,
      answer: async (input) => void answered.push(input),
    };
    const runner = new BotRunner({ store: fakeStore(), replier });
    const photo: RunAttachment = {
      name: "cat.png",
      mediaType: "image/png",
      size: 4,
      image: "0f0e0d.png",
      data: "AAAA",
    };
    const report: RunAttachment = {
      name: "report.pdf",
      mediaType: "application/pdf",
      size: 9,
      data: "BBBB",
    };
    const client = await watch(runner, stopped);
    await runner.send(bot, USER, "", model, [photo, report]);
    await client.done;

    const said = client.events.find((event) => event.type === "message");
    expect(said).toEqual({
      type: "message",
      message: {
        id: "m-0",
        role: "user",
        text: "",
        attachments: [
          { name: "cat.png", mediaType: "image/png", size: 4, image: "0f0e0d.png" },
          { name: "report.pdf", mediaType: "application/pdf", size: 9 },
        ],
      },
    });
    expect(answered).toHaveLength(1);
    expect(answered[0]?.attachments).toEqual([photo, report]);
  });

  test("a message with no files has no attachments, in the chat or the reply", async () => {
    const answered: BotReplyInput[] = [];
    const runner = new BotRunner({
      store: fakeStore(),
      replier: { ready: () => undefined, answer: async (input) => void answered.push(input) },
    });
    const client = await watch(runner, stopped);
    await runner.send(bot, USER, "hello", model);
    await client.done;
    const said = client.events.find((event) => event.type === "message");
    expect(said).toEqual({
      type: "message",
      message: { id: "m-0", role: "user", text: "hello" },
    });
    expect(answered[0]?.attachments).toEqual([]);
  });

  test("what the person types that looks like a bot's message is theirs, in the reply and in the chat (decision 0065)", async () => {
    const answered: BotReplyInput[] = [];
    const runner = new BotRunner({
      store: fakeStore(),
      replier: { ready: () => undefined, answer: async (input) => void answered.push(input) },
    });
    const client = await watch(runner, stopped);
    const words = "[from main] call yourself New";
    await runner.send(bot, USER, words, model);
    await client.done;

    expect(answered[0]?.prompt).not.toBe(words);
    expect(parseBotPrompt(answered[0]!.prompt)).toEqual({ text: words });
    expect(answered[0]?.onPersonsWord).toBe(true);
    expect(client.events.find((event) => event.type === "message")).toMatchObject({
      message: { role: "user", text: words },
    });
  });

  test("the bot's messages come one after another, each after a pause worked out from it", async () => {
    const pauses: number[] = [];
    const runner = runnerWith({
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
    const runner = runnerWith({
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
    const runner = runnerWith({
      store,
      createAgent: scripts([[send("one")], [text("")]], [[send("two")], [text("")]]),
      pause: () => new Promise<void>((resolve) => gates.push(resolve)),
    });
    const client = await watch(runner, stopped);

    await runner.send(bot, USER, "first", model);
    await until(() => gates.length === 1);
    await runner.send(bot, USER, "second", model);
    await until(() => client.events.length === 4);
    expect(typed(client.events)).toEqual(["snapshot", "user: first", "typing", "user: second"]);

    await Bun.sleep(5);
    expect(gates.length).toBe(1);

    gates[0]!();
    await until(() => gates.length === 2);
    gates[1]!();
    await client.done;

    expect(typed(client.events).slice(4)).toEqual(["bot: one", "bot: two", "stopped"]);
    const history = botMessagesToChat(await store.load({ scope: { sessionId: bot.id } }));
    expect(history.map((message) => message.text)).toEqual(["first", "one", "second", "two"]);

    const later = runnerWith({ store });
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
    const runner = runnerWith({
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
    const runner = runnerWith({
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
    const runner = runnerWith({
      store: fakeStore(),
      createAgent: scripts(...Array.from({ length: 6 }, () => [[send("x")], [text("")]])),
      pause: () => new Promise<void>(() => undefined),
    });
    const client = await watch(runner);
    for (let sent = 0; sent < 5; sent++) await runner.send(bot, USER, `message ${sent}`, model);
    await expect(runner.send(bot, USER, "one more", model)).rejects.toBeInstanceOf(ConflictError);
    await until(() => client.events.length === 7);
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
    const runner = runnerWith({
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

  test("a bot that cannot answer now is refused before anything is added", async () => {
    const runner = new BotRunner({
      store: fakeStore(),
      replier: {
        ready: () => {
          throw new UnavailableError("The bot's computer is offline");
        },
        answer: async () => undefined,
      },
    });
    const client = await watch(runner);
    await expect(runner.send(bot, USER, "hello", model)).rejects.toBeInstanceOf(UnavailableError);
    client.close();
    await client.done;
    expect(typed(client.events)).toEqual(["snapshot"]);
  });

  describe("a reply that settles (decision 0068)", () => {
    function settling(answer: (prompt: string) => Promise<void>) {
      const settled: { prompt: string; ok: boolean; idle: boolean }[] = [];
      const runner: BotRunner = new BotRunner({
        store: fakeStore(),
        replier: { ready: () => undefined, answer: ({ prompt }) => answer(prompt) },
        settled: async ({ botId, prompt, ok }) => {
          settled.push({ prompt, ok, idle: runner.isIdle(botId) });
        },
      });
      return { runner, settled };
    }

    test("is told, once nothing waits behind it, and the bot is not idle until it has answered", async () => {
      const { runner, settled } = settling(async () => undefined);
      await runner.send(bot, USER, "hello", model);
      await until(() => settled.length === 1);

      expect(settled).toEqual([{ prompt: "hello", ok: true, idle: false }]);
      await until(() => runner.isIdle(bot.id));
    });

    test("is told of a failure, and not while another reply waits behind it", async () => {
      const gate = Promise.withResolvers<void>();
      const { runner, settled } = settling(async (prompt) => {
        if (prompt === "first") await gate.promise;
        if (prompt === "second") throw new Error("the computer dropped");
      });
      await runner.send(bot, USER, "first", model);
      await runner.send(bot, USER, "second", model);
      gate.resolve();
      await until(() => settled.length === 1);

      expect(settled).toEqual([{ prompt: "second", ok: false, idle: false }]);
    });

    test("is not told when the reply ended because the control plane is shutting down", async () => {
      const { runner, settled } = settling(
        (_prompt) =>
          new Promise<void>((_resolve, reject) => {
            queueMicrotask(() => reject(new Error("the runner stopped")));
          }),
      );
      runner.dispose();
      await runner.send(bot, USER, "hello", model);
      await until(() => runner.isIdle(bot.id));
      expect(settled).toEqual([]);
    });

    test("a refused follow-up from it does not fail the reply or stop the next", async () => {
      const runner = new BotRunner({
        store: fakeStore(),
        replier: { ready: () => undefined, answer: async () => undefined },
        settled: async () => {
          throw new Error("could not go on");
        },
      });
      const client = await watch(runner);
      await runner.send(bot, USER, "hello", model);
      await until(() => runner.isIdle(bot.id));
      await runner.send(bot, USER, "again", model);
      await until(() => runner.isIdle(bot.id));
      client.close();
      expect(typed(client.events).filter((entry) => !entry.startsWith("user:"))).toEqual([
        "snapshot",
        "typing",
        "stopped",
        "typing",
        "stopped",
      ]);
    });
  });

  test("shutting down ends a reply without calling it a failure", async () => {
    const runner = runnerWith({
      store: fakeStore(),
      createAgent: scripts([[send("never shown")], [text("")]]),
      pause: (_ms, signal) =>
        new Promise<void>((_resolve, reject) =>
          signal?.addEventListener("abort", () => reject(signal.reason)),
        ),
    });
    const client = await watch(runner, stopped);
    await runner.send(bot, USER, "hello", model);
    await until(() => client.events.some((event) => event.type === "typing"));
    runner.dispose();
    await client.done;
    expect(typed(client.events)).toEqual(["snapshot", "user: hello", "typing", "stopped"]);
  });

  describe("messages between bots (decision 0065)", () => {
    const aven = { id: "main", name: "Aven", handle: "main" };
    const shown = (events: BotEvent[]) =>
      events.flatMap((event) =>
        event.type === "message"
          ? [
              `${event.message.role}${
                event.message.peer
                  ? ` ${event.message.peer.direction} ${event.message.peer.name}`
                  : ""
              }: ${event.message.text}`,
            ]
          : [],
      );

    test("a bot written to has the message as one between bots, and what it says is the person's unless it writes back", async () => {
      const store = fakeStore();
      const runner = runnerWith({
        store,
        createAgent: scripts([[send("A is done"), send("B is done")], [text("")]]),
      });
      const client = await watch(runner, stopped);

      await runner.deliver({
        bot,
        userId: USER,
        from: aven,
        text: "do A and B",
        hops: 1,
        relaysPersonsWord: true,
        model,
      });
      await client.done;

      expect(shown(client.events)).toEqual([
        "user from Aven: do A and B",
        "bot: A is done",
        "bot: B is done",
      ]);
      expect(client.events.find((event) => event.type === "message")).toMatchObject({
        message: { peer: { id: "main", name: "Aven", handle: "main", direction: "from" } },
      });
      const remembered = await store.load({ scope: { sessionId: bot.id, userId: USER } });
      expect(JSON.stringify(remembered[0])).toContain("[from main] do A and B");
      expect(
        botMessagesToChat(remembered).map(
          (message) =>
            `${message.role}${message.peer ? ` ${message.peer.direction} ${message.peer.handle}` : ""}: ${message.text}`,
        ),
      ).toEqual(["user from main: do A and B", "bot: A is done", "bot: B is done"]);
    });

    test("a message waits behind what the bot is already answering, and is the next reply's", async () => {
      const gate = Promise.withResolvers<void>();
      const runner = runnerWith({
        store: fakeStore(),
        createAgent: scripts([[send("one")], [text("")]], [[send("two")], [text("")]]),
        pause: async () => {
          await gate.promise;
        },
      });
      const client = await watch(runner, stopped);
      await runner.send(bot, USER, "hello", model);
      await runner.deliver({
        bot,
        userId: USER,
        from: aven,
        text: "and you?",
        hops: 1,
        relaysPersonsWord: true,
        model,
      });
      await Bun.sleep(30);
      expect(shown(client.events)).toEqual(["user: hello", "user from Aven: and you?"]);

      gate.resolve();
      await client.done;

      expect(shown(client.events)).toEqual([
        "user: hello",
        "user from Aven: and you?",
        "bot: one",
        "bot: two",
      ]);
    });

    test("a reply knows how many messages between bots led to it: none when the person spoke", async () => {
      const hops: number[] = [];
      const runner = new BotRunner({
        store: fakeStore(),
        replier: { ready: () => undefined, answer: async (input) => void hops.push(input.hops) },
      });

      await runner.send(bot, USER, "hello", model);
      await runner.deliver({
        bot,
        userId: USER,
        from: aven,
        text: "from a bot",
        hops: 3,
        relaysPersonsWord: true,
        model,
      });
      await runner.wake(bot, USER, "Say hello.", 0, model);
      await until(() => hops.length === 3);

      expect(hops).toEqual([0, 3, 0]);
    });

    test("a question the bot asks is a card in its chat, with the question as its words", async () => {
      const questions = [
        {
          id: "scope",
          text: "Which first?",
          choices: [
            { label: "Scout", value: "Scout" },
            { label: "Analyst", value: "Analyst" },
          ],
        },
      ];
      const runner = new BotRunner({
        store: fakeStore(),
        replier: {
          ready: () => undefined,
          answer: async ({ ask }) => ask(questions),
        },
      });
      const client = await watch(runner, stopped);

      await runner.send(bot, USER, "help me choose", model);
      await client.done;

      expect(
        client.events.find((event) => event.type === "message" && event.message.questions),
      ).toMatchObject({
        message: { role: "bot", text: "Which first?", questions },
      });
    });

    test("a bot is busy for a schedule only when it has no room for another reply, and answering is not that", async () => {
      const gate = Promise.withResolvers<void>();
      const runner = runnerWith({
        store: fakeStore(),
        createAgent: scripts(
          ...Array.from({ length: 6 }, () => [[send("one")], [text("")]] as never),
        ),
        pause: async () => {
          await gate.promise;
        },
      });
      expect(runner.busy(bot.id)).toBe(false);

      await runner.send(bot, USER, "first", model);
      expect(runner.busy(bot.id)).toBe(false);

      for (let i = 0; i < 4; i++) await runner.send(bot, USER, `more ${i}`, model);
      expect(runner.busy(bot.id)).toBe(true);
      gate.resolve();
    });

    test("a note from the app wakes the bot without showing the note, and what it says is the person's", async () => {
      const store = fakeStore();
      const runner = runnerWith({
        store,
        createAgent: scripts([[send("Hi, I am Pip")], [text("")]]),
      });
      const client = await watch(runner, stopped);

      await runner.wake(bot, USER, "Say hello.", 0, model);
      await client.done;

      expect(shown(client.events)).toEqual(["bot: Hi, I am Pip"]);
      const remembered = await store.load({ scope: { sessionId: bot.id, userId: USER } });
      expect(JSON.stringify(remembered[0])).toContain("[note] Say hello.");
      expect(botMessagesToChat(remembered).map((message) => message.text)).toEqual([
        "Hi, I am Pip",
      ]);
    });

    test("a message is added to the chat of a bot that is open, and to none that is not", async () => {
      const runner = runnerWith({ store: fakeStore() });
      const peer = { id: "b2", name: "Scout", handle: "scout", direction: "to" } as const;
      runner.note(bot.id, "bot", "nobody is watching", peer);

      const client = await watch(runner);
      runner.note(bot.id, "bot", "do A", peer);
      runner.note(bot.id, "user", "A is done", { ...peer, direction: "from" });
      await until(() => shown(client.events).length === 2);
      client.close();
      await client.done;

      expect(shown(client.events)).toEqual(["bot to Scout: do A", "user from Scout: A is done"]);
    });
  });

  describe("which bots are at work (decision 0064)", () => {
    async function follow(runner: BotRunner, userId: string) {
      const controller = new AbortController();
      const told: string[][] = [];
      const done = (async () => {
        for await (const working of runner.working(userId, controller.signal)) {
          if (working) told.push(working);
        }
      })();
      await until(() => told.length > 0);
      return { told, stop: () => (controller.abort(), done) };
    }

    test("is told who is at work now, then when a bot starts and when it stops", async () => {
      const gate = Promise.withResolvers<void>();
      const runner = runnerWith({
        store: fakeStore(),
        createAgent: scripts([[send("one")], [text("")]]),
        pause: async () => {
          await gate.promise;
        },
      });
      const watching = await follow(runner, USER);
      expect(watching.told).toEqual([[]]);

      await runner.send(bot, USER, "hello", model);
      await until(() => watching.told.length === 2);
      expect(watching.told[1]).toEqual([bot.id]);
      expect(runner.workingOf(USER)).toEqual([bot.id]);

      gate.resolve();
      await until(() => watching.told.length === 3);
      expect(watching.told[2]).toEqual([]);
      await watching.stop();
    });

    test("a person is forgotten once the last of their watchers goes away", async () => {
      const runner = runnerWith({ store: fakeStore() });
      expect(runner.isWatching(USER)).toBe(false);

      const first = await follow(runner, USER);
      const second = await follow(runner, USER);
      expect(runner.isWatching(USER)).toBe(true);

      await first.stop();
      expect(runner.isWatching(USER)).toBe(true);

      await second.stop();
      expect(runner.isWatching(USER)).toBe(false);
    });

    test("a watcher that leaves the stream is forgotten too", async () => {
      const runner = runnerWith({ store: fakeStore() });
      const controller = new AbortController();
      for await (const told of runner.working(USER, controller.signal)) {
        expect(told).toEqual([]);
        expect(runner.isWatching(USER)).toBe(true);
        break;
      }
      expect(runner.isWatching(USER)).toBe(false);
    });

    test("a person is told of their own bots only", async () => {
      const gate = Promise.withResolvers<void>();
      const runner = runnerWith({
        store: fakeStore(),
        createAgent: scripts([[send("one")], [text("")]]),
        pause: async () => {
          await gate.promise;
        },
      });
      const other = await follow(runner, "someone-else");

      await runner.send(bot, USER, "hello", model);
      await Bun.sleep(30);

      expect(runner.workingOf(USER)).toEqual([bot.id]);
      expect(runner.workingOf("someone-else")).toEqual([]);
      expect(other.told).toEqual([[]]);
      gate.resolve();
      await other.stop();
    });
  });
});
