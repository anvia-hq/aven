import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("botsService (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { inArray } = await import("drizzle-orm");
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
});
