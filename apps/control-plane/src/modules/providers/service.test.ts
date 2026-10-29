import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("providersService (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { inArray } = await import("drizzle-orm");
  const { providersService } = await import("./service");

  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `u-alice-${suffix}`;
  const bob = `u-bob-${suffix}`;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.PROVIDER_ENCRYPTION_KEY;
    process.env.PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    await db.insert(users).values([
      { id: alice, name: "Alice", email: `${alice}@aven.test` },
      { id: bob, name: "Bob", email: `${bob}@aven.test` },
    ]);
  });

  afterAll(async () => {
    process.env.PROVIDER_ENCRYPTION_KEY = previousKey;
    // Cascades remove their providers.
    await db.delete(users).where(inArray(users.id, [alice, bob]));
  });

  test("the first provider becomes the default and the key is never returned", async () => {
    const created = await providersService.create(alice, {
      kind: "openai",
      name: "Mine",
      apiKey: "sk-secret-abcd",
    });
    expect(created.isDefault).toBe(true);
    expect(created.keyHint).toBe("abcd");
    expect(created.hasKey).toBe(true);
    expect(JSON.stringify(created)).not.toContain("sk-secret");
    expect(JSON.stringify(await providersService.list(alice))).not.toContain("sk-secret");
  });

  test("providers are scoped to their user", async () => {
    const [mine] = await providersService.list(alice);
    expect(await providersService.list(bob)).toEqual([]);
    expect(await providersService.update(bob, mine!.id, { name: "stolen" })).toBeNull();
    expect(await providersService.remove(bob, mine!.id)).toBe(false);
    expect(await providersService.listModels(bob, mine!.id)).toBeNull();
    expect(await providersService.resolveModel(bob)).toBeNull();
  });

  test("resolveModel decrypts the default provider's key", async () => {
    expect(await providersService.resolveModel(alice)).toEqual({
      provider: "openai",
      modelId: undefined,
      baseUrl: undefined,
      apiKey: "sk-secret-abcd",
    });
  });

  test("a second default replaces the first, and an omitted key is kept", async () => {
    const second = await providersService.create(alice, {
      kind: "openai-compatible",
      name: "Local",
      baseUrl: "http://localhost:11434/v1",
      modelId: "llama3",
      isDefault: true,
    });
    expect(second.hasKey).toBe(false);
    const rows = await providersService.list(alice);
    expect(rows.filter((row) => row.isDefault).map((row) => row.id)).toEqual([second.id]);
    expect((await providersService.resolveModel(alice))?.provider).toBe("openai-compatible");

    const [first] = rows;
    await providersService.update(alice, first!.id, { name: "Renamed" });
    expect((await providersService.list(alice)).find((row) => row.id === first!.id)?.keyHint).toBe(
      "abcd",
    );
  });

  test("deleting the default hands the role to the oldest remaining provider", async () => {
    const rows = await providersService.list(alice);
    const current = rows.find((row) => row.isDefault)!;
    expect(await providersService.remove(alice, current.id)).toBe(true);
    const after = await providersService.list(alice);
    expect(after).toHaveLength(1);
    expect(after[0]?.isDefault).toBe(true);
  });

  test("a model id cannot be cleared on an OpenAI-compatible provider", async () => {
    const compat = await providersService.create(alice, {
      kind: "openai-compatible",
      name: "C2",
      baseUrl: "http://localhost:1/v1",
      modelId: "m",
    });
    await expect(providersService.update(alice, compat.id, { modelId: null })).rejects.toThrow(
      "needs a model id",
    );
  });
});
