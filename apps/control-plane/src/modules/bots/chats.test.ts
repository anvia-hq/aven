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
  const { NotFoundError } = await import("../../errors");
  const { botMemoryStore } = await import("../../memory-store");
  const { providers } = await import("@aven/db/schema/providers");
  const { createBotChats } = await import("./chats");
  const { BotRunner } = await import("./runner");
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

  const chats = () => {
    const runner = new BotRunner({
      store: keeping(),
      createAgent: ({ bot, deliver, memory }) =>
        createBotAgent({
          model: scriptedModel([[toolCall("send_message", { text: "hi Alice" })], [text("")]]),
          id: bot.id,
          name: bot.name,
          instruction: bot.instruction,
          deliver,
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
    const runner = new BotRunner({
      store: botMemoryStore,
      createAgent: ({ bot, deliver, memory }) =>
        createBotAgent({
          model: scriptedModel([[toolCall("send_message", { text: "kept" })], [text("")]]),
          id: bot.id,
          name: bot.name,
          instruction: bot.instruction,
          deliver,
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

    const fresh = new BotRunner({ store: botMemoryStore });
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
    const runner = new BotRunner({
      store: { load: async () => [], append: async () => undefined, clear: async () => undefined },
      createAgent: ({ bot, deliver, memory }) => {
        made.push({ name: bot.name, instruction: bot.instruction });
        return createBotAgent({
          model: scriptedModel([[text("")]]),
          id: bot.id,
          name: bot.name,
          instruction: bot.instruction,
          deliver,
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
    const runner = new BotRunner({
      store: { load: async () => [], append: async () => undefined, clear: async () => undefined },
      createAgent: ({ bot, model, deliver, memory }) => {
        used.push({ provider: model.provider, modelId: model.modelId });
        return createBotAgent({
          model: scriptedModel([[text("")]]),
          id: bot.id,
          name: bot.name,
          instruction: bot.instruction,
          deliver,
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
    const runner = new BotRunner({
      store: { load: async () => [], append: async () => undefined, clear: async () => undefined },
      createAgent: ({ bot, model, deliver, memory }) => {
        seen.push({ effort: model.reasoningEffort, compactAfterTokens: bot.compactAfterTokens });
        return createBotAgent({
          model: scriptedModel([[text("")]]),
          id: bot.id,
          name: bot.name,
          instruction: bot.instruction,
          deliver,
          memory,
        });
      },
      pause: async () => undefined,
    });
    await createBotChats(runner).send(alice, mine!.id, "hi");
    expect(seen).toEqual([{ effort: "high", compactAfterTokens: 30_000 }]);
    await botsService.update(alice, mine!.id, { providerId: null, compactAfterTokens: null });
  });

  test("a long chat is summarized past the size the bot was given, and stays whole on screen", async () => {
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
    const runner = new BotRunner({
      store: botMemoryStore,
      createAgent: ({ bot, deliver, memory }) =>
        createBotAgent({
          model: scriptedModel(Array.from({ length: 30 }, () => decide)),
          id: bot.id,
          name: bot.name,
          instruction: bot.instruction,
          deliver,
          memory,
          compactAfterTokens: bot.compactAfterTokens ?? undefined,
        }),
      pause: async () => undefined,
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
