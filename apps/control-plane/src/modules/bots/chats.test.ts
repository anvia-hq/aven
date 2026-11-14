import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import type { CompletionRequest, MemoryStore, Message } from "@anvia/core";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("createBotChats (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { eq, inArray } = await import("drizzle-orm");
  const { createBotAgent } = await import("@aven/agents/bot-agent");
  const { botMessagesToChat } = await import("@aven/agents/bot-projection");
  const { scriptedModel, text, toolCall } = await import("@aven/agents/testing/scripted-model");
  const { NotFoundError, UnprocessableError } = await import("@aven/server-kit/errors");
  const { BOT_MAX_HOPS } = await import("@aven/protocol/bots");
  const { botMemoryStore } = await import("../../memory-store");
  const { providers } = await import("@aven/db/schema/providers");
  const { encryptSecret } = await import("@aven/server-kit/crypto");
  const { modelCatalog } = await import("../providers/model-catalog");
  const { InvalidSelectionError } = await import("../providers/resolve-model");
  const { createBotChats } = await import("./chats");
  const { BotRunner } = await import("./runner");
  const { inProcessReplier } = await import("./testing/in-process-replier");
  const { loopbackReplier } = await import("./testing/loopback-replier");
  const { botsService } = await import("./service");

  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `u-alice-${suffix}`;
  const bob = `u-bob-${suffix}`;

  let previousCatalogUrl: string | undefined;

  beforeAll(async () => {
    previousCatalogUrl = process.env.MODEL_CATALOG_URL;
    process.env.MODEL_CATALOG_URL = "";
    await db.insert(users).values([
      { id: alice, name: "Alice", email: `${alice}@aven.test` },
      { id: bob, name: "Bob", email: `${bob}@aven.test` },
    ]);
  });

  afterAll(async () => {
    if (previousCatalogUrl === undefined) delete process.env.MODEL_CATALOG_URL;
    else process.env.MODEL_CATALOG_URL = previousCatalogUrl;

    await db.delete(users).where(inArray(users.id, [alice, bob]));
  });

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

  describe("files sent with a message (decision 0080)", () => {
    const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const answeredBy = async (answered: unknown[], count: number) => {
      for (let tries = 0; answered.length < count && tries < 2000; tries++) await Bun.sleep(1);
    };
    const capturing = () => {
      const answered: { prompt: string; attachments: unknown[] }[] = [];
      const runner = new BotRunner({
        store: keeping(),
        replier: {
          ready: () => undefined,
          answer: async ({ prompt, attachments = [] }) =>
            void answered.push({ prompt, attachments }),
        },
      });
      return { botChats: createBotChats(runner), answered };
    };

    test("reach the reply with their bytes, an image under a name of its own, and a message may be only files", async () => {
      const [mine] = await botsService.list(alice);
      const { botChats, answered } = capturing();
      await botChats.send(alice, mine!.id, "", [
        { name: "cat.png", data: PNG.toBase64() },
        {
          name: "notes.txt",
          mediaType: "text/plain",
          data: new TextEncoder().encode("hi").toBase64(),
        },
      ]);
      await answeredBy(answered, 1);

      expect(answered).toHaveLength(1);
      const [image, file] = answered[0]!.attachments as {
        name: string;
        mediaType: string;
        image?: string;
        data: string;
      }[];
      expect(image).toMatchObject({
        name: "cat.png",
        mediaType: "image/png",
        data: PNG.toBase64(),
      });
      expect(image?.image).toMatch(/^[0-9a-f-]{36}\.png$/);
      expect(file).toMatchObject({ name: "notes.txt", mediaType: "text/plain" });
      expect(file?.image).toBeUndefined();
    });

    test("an image for a model that cannot see one is refused, and other files are not", async () => {
      const [mine] = await botsService.list(alice);
      const { botChats, answered } = capturing();
      const blind = spyOn(modelCatalog, "seesImages").mockResolvedValue(false);
      try {
        await expect(
          botChats.send(alice, mine!.id, "look", [{ name: "cat.png", data: PNG.toBase64() }]),
        ).rejects.toBeInstanceOf(InvalidSelectionError);
        expect(answered).toEqual([]);

        await botChats.send(alice, mine!.id, "read", [
          { name: "notes.txt", data: new TextEncoder().encode("hi").toBase64() },
        ]);
        await answeredBy(answered, 1);
        expect(answered).toHaveLength(1);
      } finally {
        blind.mockRestore();
      }
    });

    test("that are too big are refused before anything is added to the chat", async () => {
      const [mine] = await botsService.list(alice);
      const { botChats, answered } = capturing();
      const big = new Uint8Array(6 * 1024 * 1024).toBase64();
      await expect(
        botChats.send(alice, mine!.id, "look", [
          { name: "a.bin", data: big },
          { name: "b.bin", data: big },
        ]),
      ).rejects.toBeInstanceOf(UnprocessableError);
      expect(answered).toEqual([]);
    });
  });

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
        const sent = await botChats.deliver({
          userId: userId,
          from: from,
          hops: hops,
          handle: to,
          text: said,
          relaysPersonsWord: false,
        });
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

    const sent = await botChats.deliver({
      userId: alice,
      from: main!,
      hops: 0,
      handle: scout.handle,
      text: "do A",
      relaysPersonsWord: true,
    });
    expect(sent).toEqual({ handle: "scout", name: "Scout" });
    await Bun.sleep(30);

    expect(heard).toEqual(["bot to: do A", "user from: Scout did A"]);
    expect(await chatOf(runner, scout.id, alice)).toEqual([
      {
        id: "m-0",
        role: "user",
        text: "do A",
        peer: { name: "main", handle: "main", direction: "from" },
      },
      {
        id: "b-0",
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
      { id: "b-0", role: "bot", text: "Hi, I am Hello" },
    ]);
    await expect(botChats.greet(bob, scout.id, 0)).rejects.toBeInstanceOf(NotFoundError);
  });

  test("a bot cannot write to itself, to a bot that is not its person's, or to one that is not there", async () => {
    const [main] = await botsService.list(alice);
    await botsService.list(bob);
    const theirs = await botsService.create(bob, { name: "Bobby", instruction: "x" });
    const { botChats } = writingBack();

    await expect(
      botChats.deliver({
        userId: alice,
        from: main!,
        hops: 0,
        handle: main!.handle,
        text: "hi",
        relaysPersonsWord: true,
      }),
    ).rejects.toBeInstanceOf(UnprocessableError);
    await expect(
      botChats.deliver({
        userId: alice,
        from: main!,
        hops: 0,
        handle: theirs.handle,
        text: "hi",
        relaysPersonsWord: true,
      }),
    ).rejects.toThrow(`No bot with the handle "bobby"`);
    await expect(
      botChats.deliver({
        userId: alice,
        from: main!,
        hops: 0,
        handle: "ghost",
        text: "hi",
        relaysPersonsWord: true,
      }),
    ).rejects.toBeInstanceOf(UnprocessableError);
  });

  test("a bot with a lot to answer refuses more, and the sender's chat has only what was sent", async () => {
    const [main] = await botsService.list(alice);
    const busy = await botsService.create(alice, { name: "Busy", instruction: "x" });
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
        botChats.deliver({
          userId: alice,
          from: main!,
          hops: 0,
          handle: busy.handle,
          text: `task ${i}`,
          relaysPersonsWord: true,
        }),
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

    await botChats.deliver({
      userId: alice,
      from: main!,
      hops: BOT_MAX_HOPS - 1,
      handle: scout.handle,
      text: "still fine",
      relaysPersonsWord: true,
    });
    await expect(
      botChats.deliver({
        userId: alice,
        from: main!,
        hops: BOT_MAX_HOPS,
        handle: scout.handle,
        text: "one too many",
        relaysPersonsWord: true,
      }),
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

  test("the bot runs on the model it was given, else its provider's own, else the person's default", async () => {
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
    const [preferred] = await db
      .insert(providers)
      .values({
        userId: alice,
        kind: "openai-compatible",
        name: "Default",
        baseUrl: "http://localhost:1/v1",
        modelId: "default-model",
        isDefault: true,
      })
      .returning();
    try {
      await botsService.update(alice, mine!.id, { providerId: null });
      await chats.send(alice, mine!.id, "three");
    } finally {
      await db.delete(providers).where(eq(providers.id, preferred!.id));
    }
    expect(used).toEqual([
      { provider: "openai-compatible", modelId: "chosen-1" },
      { provider: "openai-compatible", modelId: "provider-model" },
      { provider: "openai-compatible", modelId: "default-model" },
    ]);
  });

  test("the bot's effort and its compaction size reach the agent", async () => {
    const [mine] = await botsService.list(alice);
    const [openai] = await db
      .insert(providers)
      .values({
        userId: alice,
        kind: "openai",
        name: "OpenAI",
        modelId: "gpt-5",
        apiKeyEncrypted: encryptSecret("sk-test"),
      })
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

    const requests: string[] = [];
    let spoke = false;
    const decide = (request: CompletionRequest) => {
      requests.push(JSON.stringify(request));

      if (!request.tools?.length) return [text("SUMMARY OF EARLIER TALK")];

      spoke = !spoke;
      return spoke ? [toolCall("send_message", { text: "ok" })] : [text("")];
    };
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
    const filler = "apples and oranges ".repeat(260);
    await say(`FIRSTMARK ${filler}`);
    await say(`second ${filler}`);
    await say(`third ${filler}`);
    await say(`fourth ${filler}`);

    const lastAsked = requests.findLast((request) => request.includes("fourth"))!;
    expect(lastAsked).toContain("SUMMARY OF EARLIER TALK");
    expect(lastAsked).not.toContain("FIRSTMARK");

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
