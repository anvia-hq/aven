import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { MemoryStore, Message } from "@anvia/core";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("createBotChats (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { inArray } = await import("drizzle-orm");
  const { createBotAgent } = await import("@aven/agents/bot-agent");
  const { scriptedModel, text, toolCall } = await import("@aven/agents/testing/scripted-model");
  const { NotFoundError } = await import("../../errors");
  const { botMemoryStore } = await import("../../memory-store");
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
});
