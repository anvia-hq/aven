import { afterAll, beforeAll, describe, expect, test } from "bun:test";

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

  test("bots are scoped to their person", async () => {
    const [mine] = await botsService.list(alice);
    const [theirs] = await botsService.list(bob);
    expect(theirs!.id).not.toBe(mine!.id);
    expect(theirs!.name).toBe("Aven");
    expect(await botsService.get(bob, mine!.id)).toBeNull();
    expect(await botsService.update(bob, mine!.id, { name: "Mine now" })).toBeNull();
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
});
