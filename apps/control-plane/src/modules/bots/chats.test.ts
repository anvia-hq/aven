import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { CompletionRequest, MemoryStore, Message } from "@anvia/core";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("createBotChats (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { inArray } = await import("drizzle-orm");
  const { createBotAgent } = await import("@aven/agents/bot-agent");
  const { botMessagesToChat } = await import("@aven/agents/bot-projection");
  const { scriptedModel, text, toolCall } = await import("@aven/agents/testing/scripted-model");
  const { NotFoundError, UnprocessableError } = await import("../../errors");
  const { BOT_MAX_HOPS } = await import("@aven/protocol/bots");
  const { botMemoryStore } = await import("../../memory-store");
  const { providers } = await import("@aven/db/schema/providers");
  const { createBotChats } = await import("./chats");
  const { BotRunner } = await import("./runner");
  const { inProcessReplier } = await import("./testing/in-process-replier");
  const { loopbackReplier } = await import("./testing/loopback-replier");
  const { botsService } = await import("./service");

  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `u-alice-${suffix}`;
  const bob = `u-bob-${suffix}`;

  beforeAll(async () => {
    await db.insert(users).values([
      { id: alice, name: "Alice", email: `${alice}@aven.test` },
      { id: bob, name: "Bob", email: `${bob}@aven.test` },
    ]);
  });

  afterAll(async () => {
    // Cascades remove their bots.
    await db.delete(users).where(inArray(users.id, [alice, bob]));
  });

  // A store that keeps what is appended, as the database does.
  const keeping = () => {
    const kept = new Map<string, Message[]>();
    return {
      load: async ({ scope }) => kept.get(scope.sessionId) ?? [],
      append: async ({ scope, messages }) => {
        const earlier = kept.get(scope.sessionId) ?? [];
        earlier.push(...messages);
        kept.set(scope.sessionId, earlier);
      },
      clear: async ({ scope }) => void kept.delete(scope.sessionId),
    } satisfies MemoryStore;
  };

  // A runner whose bot answers in this process, with the agent a test made.
  const runnerWith = (options: {
    store: MemoryStore;
    createAgent?: Parameters<typeof inProcessReplier>[0]["createAgent"];
    pause?: (ms: number, signal?: AbortSignal) => Promise<void>;
    sendToBot?: Parameters<typeof inProcessReplier>[0]["sendToBot"];
  }) =>
    new BotRunner({
      store: options.store,
      replier: inProcessReplier({
        store: options.store,
        createAgent:
          options.createAgent ??
          (() => {
            throw new Error("This runner is only read from");
          }),
        pause: options.pause,
        sendToBot: options.sendToBot,
      }),
    });

  const chats = () => {
    const runner = runnerWith({
      store: keeping(),
      createAgent: ({ bot, send, memory }) =>
        createBotAgent({
          model: scriptedModel([[toolCall("send_message", { text: "hi Alice" })], [text("")]]),
          id: bot.id,
          name: bot.name,
          handle: bot.handle,
          peers: [],
          instruction: bot.instruction,
          send,
          memory,
        }),
      pause: async () => undefined,
    });
    return createBotChats(runner);
  };

  test("a person talks to their own bot and hears it answer", async () => {
    const [mine] = await botsService.list(alice);
    const botChats = chats();
    await botChats.send(alice, mine!.id, "hello");

    const controller = new AbortController();
    const seen: string[] = [];
    for await (const event of botChats.events(alice, mine!.id, controller.signal)) {
      if (event?.type === "snapshot") seen.push(...event.messages.map((message) => message.text));
      if (event?.type === "message") seen.push(event.message.text);
      if (seen.length === 2) controller.abort();
    }
    expect(seen).toEqual(["hello", "hi Alice"]);
  });

  // The messages of a bot's chat as they are now, read from a runner.
  const chatOf = async (runner: InstanceType<typeof BotRunner>, botId: string, userId: string) => {
    const controller = new AbortController();
    const [messages] = await Array.fromAsync(
      (async function* () {
        for await (const event of runner.events(botId, userId, controller.signal)) {
          if (event?.type === "snapshot") {
            controller.abort();
            yield event.messages;
          }
        }
      })(),
    );
    return messages!;
  };

  // Bots that write to each other (decision 0065): the main bot says nothing, and any other writes
  // back to it, which is what the person's request amounted to.
  const writingBack = () => {
    const runner: InstanceType<typeof BotRunner> = runnerWith({
      store: keeping(),
      createAgent: ({ bot, send, memory }) =>
        createBotAgent({
          model: scriptedModel(
            bot.isMain
              ? [[text("")]]
              : [[toolCall("send_message", { to: "main", text: `${bot.name} did A` })], [text("")]],
          ),
          id: bot.id,
          name: bot.name,
          handle: bot.handle,
          peers: [],
          instruction: bot.instruction,
          send,
          memory,
        }),
      pause: async () => undefined,
      sendToBot: async ({ from, userId, hops, to, text: said }) => {
        const sent = await botChats.deliver(userId, from, hops, to, said);
        return `Sent to ${sent.name}`;
      },
    });
    const botChats = createBotChats(runner);
    return { runner, botChats };
  };

  test("one bot of a person writes to another, the other writes back later, and both chats have the exchange between bots", async () => {
    const [main] = await botsService.list(alice);
    const scout = await botsService.create(alice, { name: "Scout", instruction: "You research." });
    const { runner, botChats } = writingBack();
    // The writing bot's chat is open, so the exchange is added to it as it happens.
    const watching = runner.events(main!.id, alice, new AbortController().signal);
    await watching.next();
    const heard: string[] = [];
    void (async () => {
      for await (const event of watching) {
        if (event?.type === "message" && event.message.peer) {
          heard.push(
            `${event.message.role} ${event.message.peer.direction}: ${event.message.text}`,
          );
        }
      }
    })();

    const sent = await botChats.deliver(alice, main!, 0, scout.handle, "do A");
    // Nothing is waited for: the answer is a message of its own, which comes when the bot has it.
    expect(sent).toEqual({ handle: "scout", name: "Scout" });
    await Bun.sleep(30);

    expect(heard).toEqual(["bot to: do A", "user from: Scout did A"]);
    // Read back from what the bot remembers, which knows the other bot by its handle.
    expect(await chatOf(runner, scout.id, alice)).toEqual([
      {
        id: "m-0",
        role: "user",
        text: "do A",
        peer: { name: "main", handle: "main", direction: "from" },
      },
      {
        id: "m-1",
        role: "bot",
        text: "Scout did A",
        peer: { name: "main", handle: "main", direction: "to" },
      },
    ]);
  });

  test("a bot just made says hello unasked, in its own chat, with no note shown", async () => {
    const scout = await botsService.create(alice, { name: "Hello", instruction: "You greet." });
    const runner = runnerWith({
      store: keeping(),
      createAgent: ({ bot, send, memory }) =>
        createBotAgent({
          model: scriptedModel([
            [toolCall("send_message", { text: `Hi, I am ${bot.name}` })],
            [text("")],
          ]),
          id: bot.id,
          name: bot.name,
          handle: bot.handle,
          peers: [],
          instruction: bot.instruction,
          send,
          memory,
        }),
      pause: async () => undefined,
    });
    const botChats = createBotChats(runner);

    await botChats.greet(alice, scout.id, 0);
    await Bun.sleep(20);

    expect(await chatOf(runner, scout.id, alice)).toEqual([
      { id: "m-0", role: "bot", text: "Hi, I am Hello" },
    ]);
    await expect(botChats.greet(bob, scout.id, 0)).rejects.toBeInstanceOf(NotFoundError);
  });

  test("a bot cannot write to itself, to a bot that is not its person's, or to one that is not there", async () => {
    const [main] = await botsService.list(alice);
    await botsService.list(bob);
    const theirs = await botsService.create(bob, { name: "Bobby", instruction: "x" });
    const { botChats } = writingBack();

    await expect(botChats.deliver(alice, main!, 0, main!.handle, "hi")).rejects.toBeInstanceOf(
      UnprocessableError,
    );
    await expect(botChats.deliver(alice, main!, 0, theirs.handle, "hi")).rejects.toThrow(
      `No bot with the handle "bobby"`,
    );
    await expect(botChats.deliver(alice, main!, 0, "ghost", "hi")).rejects.toBeInstanceOf(
      UnprocessableError,
    );
  });

  test("a bot with a lot to answer refuses more, and the sender's chat has only what was sent", async () => {
    const [main] = await botsService.list(alice);
    const busy = await botsService.create(alice, { name: "Busy", instruction: "x" });
    // Its first reply never ends, so what comes after waits behind it.
    const runner = runnerWith({
      store: keeping(),
      createAgent: ({ bot, send, memory }) =>
        createBotAgent({
          model: scriptedModel([[toolCall("send_message", { text: "late" })], [text("")]]),
          id: bot.id,
          name: bot.name,
          handle: bot.handle,
          peers: [],
          instruction: bot.instruction,
          send,
          memory,
        }),
      pause: () => new Promise<void>(() => undefined),
    });
    const botChats = createBotChats(runner);
    const watching = runner.events(main!.id, alice, new AbortController().signal);
    await watching.next();
    const noted: string[] = [];
    void (async () => {
      for await (const event of watching) {
        if (event?.type === "message") noted.push(event.message.text);
      }
    })();

    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        botChats.deliver(alice, main!, 0, busy.handle, `task ${i}`),
      ),
    );
    await Bun.sleep(10);

    const refused = attempts.filter((attempt) => attempt.status === "rejected");
    expect(refused.length).toBeGreaterThan(0);
    expect(refused[0]).toMatchObject({ reason: { message: expect.stringContaining("a lot") } });
    expect(noted).toHaveLength(attempts.length - refused.length);
  });

  test("messages between bots in a long chain are cut off, so two bots cannot answer each other for ever", async () => {
    const [main] = await botsService.list(alice);
    const scout = await botsService.create(alice, { name: "Echo", instruction: "x" });
    const { botChats } = writingBack();

    await botChats.deliver(alice, main!, BOT_MAX_HOPS - 1, scout.handle, "still fine");
    await expect(
      botChats.deliver(alice, main!, BOT_MAX_HOPS, scout.handle, "one too many"),
    ).rejects.toThrow("Too many bot-to-bot messages");
  });

  test("nobody else can talk to it or listen in", async () => {
    const [mine] = await botsService.list(alice);
    const botChats = chats();
    await expect(botChats.send(bob, mine!.id, "hello")).rejects.toBeInstanceOf(NotFoundError);
    const listening = botChats.events(bob, mine!.id, new AbortController().signal).next();
    await expect(listening).rejects.toBeInstanceOf(NotFoundError);
  });

  test("the chat is kept in the database, under the bot and its owner", async () => {
    const [mine] = await botsService.list(alice);
    const scope = { sessionId: mine!.id, userId: alice };
    await botMemoryStore.clear({ scope });
    const runner = runnerWith({
      store: botMemoryStore,
      createAgent: ({ bot, send, memory }) =>
        createBotAgent({
          model: scriptedModel([[toolCall("send_message", { text: "kept" })], [text("")]]),
          id: bot.id,
          name: bot.name,
          handle: bot.handle,
          peers: [],
          instruction: bot.instruction,
          send,
          memory,
        }),
      pause: async () => undefined,
    });
    const controller = new AbortController();
    const stream = runner.events(mine!.id, alice, controller.signal);
    await stream.next();
    await createBotChats(runner).send(alice, mine!.id, "remember me");
    for await (const event of stream) {
      if (event?.type === "typing" && !event.typing) controller.abort();
    }

    const fresh = runnerWith({ store: botMemoryStore });
    const reopened = new AbortController();
    const [first] = await Array.fromAsync(
      (async function* () {
        for await (const event of fresh.events(mine!.id, alice, reopened.signal)) {
          yield event;
          reopened.abort();
        }
      })(),
    );
    expect(first?.type === "snapshot" && first.messages.map((message) => message.text)).toEqual([
      "remember me",
      "kept",
    ]);
    // Another person's scope on the same bot id finds nothing.
    expect(await botMemoryStore.load({ scope: { sessionId: mine!.id, userId: bob } })).toEqual([]);
    await botMemoryStore.clear({ scope });
  });

  test("the bot is run as the person has last changed it", async () => {
    const [mine] = await botsService.list(alice);
    const made: { name: string; instruction: string }[] = [];
    const runner = runnerWith({
      store: { load: async () => [], append: async () => undefined, clear: async () => undefined },
      createAgent: ({ bot, send, memory }) => {
        made.push({ name: bot.name, instruction: bot.instruction });
        return createBotAgent({
          model: scriptedModel([[text("")]]),
          id: bot.id,
          name: bot.name,
          handle: bot.handle,
          peers: [],
          instruction: bot.instruction,
          send,
          memory,
        });
      },
      pause: async () => undefined,
    });
    await botsService.update(alice, mine!.id, { name: "Pip", instruction: "Talk like a pirate." });
    await createBotChats(runner).send(alice, mine!.id, "ahoy");
    expect(made).toEqual([{ name: "Pip", instruction: "Talk like a pirate." }]);
  });

  test("the bot runs on the model it was given, else the person's default", async () => {
    process.env.MODEL_CATALOG_URL = "";
    const [mine] = await botsService.list(alice);
    const [provider] = await db
      .insert(providers)
      .values({
        userId: alice,
        kind: "openai-compatible",
        name: "Bot's own",
        baseUrl: "http://localhost:1/v1",
        modelId: "provider-model",
      })
      .returning();
    const used: { provider: string; modelId?: string }[] = [];
    const runner = runnerWith({
      store: { load: async () => [], append: async () => undefined, clear: async () => undefined },
      createAgent: ({ bot, model, send, memory }) => {
        used.push({ provider: model.provider, modelId: model.modelId });
        return createBotAgent({
          model: scriptedModel([[text("")]]),
          id: bot.id,
          name: bot.name,
          handle: bot.handle,
          peers: [],
          instruction: bot.instruction,
          send,
          memory,
        });
      },
      pause: async () => undefined,
    });
    const chats = createBotChats(runner);

    await botsService.update(alice, mine!.id, { providerId: provider!.id, modelId: "chosen-1" });
    await chats.send(alice, mine!.id, "one");
    await botsService.update(alice, mine!.id, { providerId: provider!.id });
    await chats.send(alice, mine!.id, "two");
    expect(used).toEqual([
      { provider: "openai-compatible", modelId: "chosen-1" },
      { provider: "openai-compatible", modelId: "provider-model" },
    ]);
    await botsService.update(alice, mine!.id, { providerId: null });
  });

  test("the bot's effort and its compaction size reach the agent", async () => {
    process.env.MODEL_CATALOG_URL = "";
    const [mine] = await botsService.list(alice);
    const [openai] = await db
      .insert(providers)
      .values({ userId: alice, kind: "openai", name: "OpenAI", modelId: "gpt-5" })
      .returning();
    await botsService.update(alice, mine!.id, {
      providerId: openai!.id,
      modelId: "gpt-5",
      reasoningEffort: "high",
      compactAfterTokens: 30_000,
    });
    const seen: { effort?: string; compactAfterTokens: number | null }[] = [];
    const runner = runnerWith({
      store: { load: async () => [], append: async () => undefined, clear: async () => undefined },
      createAgent: ({ bot, model, send, memory }) => {
        seen.push({ effort: model.reasoningEffort, compactAfterTokens: bot.compactAfterTokens });
        return createBotAgent({
          model: scriptedModel([[text("")]]),
          id: bot.id,
          name: bot.name,
          handle: bot.handle,
          peers: [],
          instruction: bot.instruction,
          send,
          memory,
        });
      },
      pause: async () => undefined,
    });
    await createBotChats(runner).send(alice, mine!.id, "hi");
    expect(seen).toEqual([{ effort: "high", compactAfterTokens: 30_000 }]);
    await botsService.update(alice, mine!.id, { providerId: null, compactAfterTokens: null });
  });

  test("a long chat is summarized past the size the bot was given, through the runner's calls, and stays whole on screen", async () => {
    const [mine] = await botsService.list(alice);
    const scope = { sessionId: mine!.id, userId: alice };
    await botMemoryStore.clear({ scope });
    await botsService.update(alice, mine!.id, { compactAfterTokens: 1000 });

    // A model that sends "ok" to each message, and summarizes when asked (a request with no tools).
    const requests: string[] = [];
    let spoke = false;
    const decide = (request: CompletionRequest) => {
      requests.push(JSON.stringify(request));
      if (!request.tools?.length) return [text("SUMMARY OF EARLIER TALK")];
      spoke = !spoke;
      return spoke ? [toolCall("send_message", { text: "ok" })] : [text("")];
    };
    // The runner's own code answers, and asks the real store through the answers of the control plane.
    const runner = new BotRunner({
      store: botMemoryStore,
      replier: loopbackReplier({
        store: botMemoryStore,
        createAgent: ({ bot, send, memory }) =>
          createBotAgent({
            model: scriptedModel(Array.from({ length: 30 }, () => decide)),
            id: bot.id,
            name: bot.name,
            handle: bot.handle,
            peers: [],
            instruction: bot.instruction,
            send,
            memory,
            compactAfterTokens: bot.compactAfterTokens,
          }),
      }),
    });
    const botChats = createBotChats(runner);

    const say = async (message: string) => {
      const stream = runner.events(mine!.id, alice, new AbortController().signal);
      await stream.next();
      await botChats.send(alice, mine!.id, message);
      for await (const event of stream) {
        if (event?.type === "typing" && !event.typing) break;
      }
    };
    // About 1,250 tokens each, past the size, so every turn after the first has old ones to fold.
    const filler = "apples and oranges ".repeat(260);
    await say(`FIRSTMARK ${filler}`);
    await say(`second ${filler}`);
    await say(`third ${filler}`);
    await say(`fourth ${filler}`);

    const lastAsked = requests.findLast((request) => request.includes("fourth"))!;
    expect(lastAsked).toContain("SUMMARY OF EARLIER TALK");
    expect(lastAsked).not.toContain("FIRSTMARK");

    // The conversation the person sees is whole: nothing was lost to the summary.
    const chat = botMessagesToChat(await botMemoryStore.load({ scope }));
    expect(chat.map((message) => message.text.slice(0, 9))).toEqual([
      "FIRSTMARK",
      "ok",
      "second ap",
      "ok",
      "third app",
      "ok",
      "fourth ap",
      "ok",
    ]);
    await botMemoryStore.clear({ scope });
    await botsService.update(alice, mine!.id, { compactAfterTokens: null });
  });
});
