import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { BOT_LIMIT } from "@aven/protocol/bots";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("botsService (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { eq, inArray } = await import("drizzle-orm");
  const { providers } = await import("@aven/db/schema/providers");
  const { UnprocessableError } = await import("../../errors");
  const { botsService } = await import("./service");

  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `u-alice-${suffix}`;
  const bob = `u-bob-${suffix}`;

  beforeAll(async () => {
    process.env.MODEL_CATALOG_URL = "";
    await db.insert(users).values([
      { id: alice, name: "Alice", email: `${alice}@aven.test` },
      { id: bob, name: "Bob", email: `${bob}@aven.test` },
    ]);
  });

  afterAll(async () => {
    // Cascades remove their bots.
    await db.delete(users).where(inArray(users.id, [alice, bob]));
  });

  test("a person always has a main bot, made once", async () => {
    const [first, ...rest] = await botsService.list(alice);
    expect(rest).toEqual([]);
    expect(first?.isMain).toBe(true);
    expect(first?.name).toBe("Aven");

    const again = await Promise.all([botsService.list(alice), botsService.list(alice)]);
    for (const bots of again) expect(bots.map((bot) => bot.id)).toEqual([first!.id]);
  });

  test("name, avatar and instruction can be changed, and what is left out stays", async () => {
    const [main] = await botsService.list(alice);
    const changed = await botsService.update(alice, main!.id, { name: "Pip", avatar: "🐦" });
    expect(changed).toMatchObject({ name: "Pip", avatar: "🐦", instruction: main!.instruction });
    expect((await botsService.list(alice))[0]).toMatchObject({ name: "Pip", isMain: true });
  });

  test("a bot's description is its own, starts empty, and can be written and cleared", async () => {
    const [main] = await botsService.list(alice);
    expect(main?.description).toBe("");
    const written = await botsService.update(alice, main!.id, { description: "Your companion" });
    expect(written).toMatchObject({ description: "Your companion", name: main!.name });
    expect(await botsService.update(alice, main!.id, { description: "" })).toMatchObject({
      description: "",
    });
  });

  test("bots are scoped to their person", async () => {
    const [mine] = await botsService.list(alice);
    const [theirs] = await botsService.list(bob);
    expect(theirs!.id).not.toBe(mine!.id);
    expect(theirs!.name).toBe("Aven");
    expect(await botsService.get(bob, mine!.id)).toBeNull();
    expect(await botsService.update(bob, mine!.id, { name: "Mine now" })).toBeNull();
  });

  test("a bot made for a person is theirs, not the main one, and answers with their default model", async () => {
    const made = await botsService.create(alice, {
      name: "Scout",
      instruction: "You research.",
      description: "Looks things up.",
      avatar: "🔭",
    });
    expect(made).toMatchObject({
      name: "Scout",
      instruction: "You research.",
      description: "Looks things up.",
      avatar: "🔭",
      isMain: false,
      providerId: null,
      modelId: null,
    });

    const [first, ...others] = await botsService.list(alice);
    expect(first?.isMain).toBe(true);
    expect(others.map((bot) => bot.id)).toContain(made.id);
    expect((await botsService.list(bob)).map((bot) => bot.id)).not.toContain(made.id);
    expect(await botsService.get(bob, made.id)).toBeNull();
  });

  test("a person can have only so many bots", async () => {
    const carol = `u-carol-${suffix}`;
    await db.insert(users).values({ id: carol, name: "Carol", email: `${carol}@aven.test` });
    try {
      await botsService.list(carol);
      for (let i = 1; i < BOT_LIMIT; i++) {
        await botsService.create(carol, { name: `Bot ${i}`, instruction: "x" });
      }
      expect(await botsService.list(carol)).toHaveLength(BOT_LIMIT);
      await expect(
        botsService.create(carol, { name: "One too many", instruction: "x" }),
      ).rejects.toThrow(UnprocessableError);
      expect(await botsService.list(carol)).toHaveLength(BOT_LIMIT);
    } finally {
      await db.delete(users).where(eq(users.id, carol));
    }
  });

  const addProvider = async (userId: string, name: string) => {
    const [row] = await db
      .insert(providers)
      .values({ userId, kind: "openai-compatible", name, baseUrl: "http://localhost:1/v1" })
      .returning();
    return row!;
  };

  test("a bot's model is one of its person's providers and one of its models", async () => {
    const [main] = await botsService.list(alice);
    expect(main).toMatchObject({ providerId: null, modelId: null });
    const mine = await addProvider(alice, "Mine");

    const chosen = await botsService.update(alice, main!.id, {
      providerId: mine.id,
      modelId: "fast-1",
    });
    expect(chosen).toMatchObject({ providerId: mine.id, modelId: "fast-1" });

    // Another provider starts without a model; none at all puts the bot back on the default.
    const other = await addProvider(alice, "Other");
    expect(await botsService.update(alice, main!.id, { providerId: other.id })).toMatchObject({
      providerId: other.id,
      modelId: null,
    });
    await botsService.update(alice, main!.id, { providerId: mine.id, modelId: "fast-1" });
    expect(await botsService.update(alice, main!.id, { providerId: null })).toMatchObject({
      providerId: null,
      modelId: null,
    });
  });

  test("a bot cannot be given somebody else's provider", async () => {
    const [main] = await botsService.list(alice);
    const theirs = await addProvider(bob, "Bob's");
    await expect(
      botsService.update(alice, main!.id, { providerId: theirs.id }),
    ).rejects.toBeInstanceOf(UnprocessableError);
    expect((await botsService.get(alice, main!.id))?.providerId).toBeNull();
  });

  test("a provider that is removed leaves the bot on the default, with no stale model", async () => {
    const [main] = await botsService.list(alice);
    const doomed = await addProvider(alice, "Doomed");
    await botsService.update(alice, main!.id, { providerId: doomed.id, modelId: "gone-1" });
    await db.delete(providers).where(eq(providers.id, doomed.id));
    expect(await botsService.get(alice, main!.id)).toMatchObject({
      providerId: null,
      modelId: null,
    });
  });

  const addOpenAi = async (userId: string) => {
    const [row] = await db
      .insert(providers)
      .values({ userId, kind: "openai", name: "OpenAI", modelId: "gpt-5" })
      .returning();
    return row!;
  };

  test("a reasoning effort must be one the bot's model takes", async () => {
    const [main] = await botsService.list(alice);
    const openai = await addOpenAi(alice);
    await botsService.update(alice, main!.id, { providerId: openai.id, modelId: "gpt-5" });

    const set = await botsService.update(alice, main!.id, { reasoningEffort: "high" });
    expect(set).toMatchObject({ providerId: openai.id, modelId: "gpt-5", reasoningEffort: "high" });
    await expect(botsService.update(alice, main!.id, { reasoningEffort: "turbo" })).rejects.toThrow(
      'does not support the "turbo" reasoning effort',
    );
    expect((await botsService.get(alice, main!.id))?.reasoningEffort).toBe("high");

    // A compatible server has no levels at all.
    const compatible = await addProvider(alice, "Compatible");
    await expect(
      botsService.update(alice, main!.id, {
        providerId: compatible.id,
        modelId: "any",
        reasoningEffort: "high",
      }),
    ).rejects.toBeInstanceOf(UnprocessableError);
    await botsService.update(alice, main!.id, { providerId: null });
  });

  test("a changed model starts without an effort, and a bot on the default has none", async () => {
    const [main] = await botsService.list(alice);
    const openai = await addOpenAi(alice);
    await botsService.update(alice, main!.id, {
      providerId: openai.id,
      modelId: "gpt-5",
      reasoningEffort: "low",
    });
    // The same request that changes the model may name the effort for it.
    expect(
      await botsService.update(alice, main!.id, { modelId: "o3", reasoningEffort: "high" }),
    ).toMatchObject({ modelId: "o3", reasoningEffort: "high" });
    expect(await botsService.update(alice, main!.id, { modelId: "gpt-5" })).toMatchObject({
      modelId: "gpt-5",
      reasoningEffort: null,
    });

    await botsService.update(alice, main!.id, { reasoningEffort: "medium" });
    expect(await botsService.update(alice, main!.id, { name: "Pip" })).toMatchObject({
      reasoningEffort: "medium",
    });
    expect(await botsService.update(alice, main!.id, { providerId: null })).toMatchObject({
      providerId: null,
      reasoningEffort: null,
    });
  });

  test("the size at which the chat is summarized can be set and cleared", async () => {
    const [main] = await botsService.list(alice);
    expect(main?.compactAfterTokens).toBeNull();
    expect(await botsService.update(alice, main!.id, { compactAfterTokens: 40_000 })).toMatchObject(
      { compactAfterTokens: 40_000 },
    );
    expect(await botsService.update(alice, main!.id, { name: "Pip" })).toMatchObject({
      compactAfterTokens: 40_000,
    });
    expect(await botsService.update(alice, main!.id, { compactAfterTokens: null })).toMatchObject({
      compactAfterTokens: null,
    });
  });
});
