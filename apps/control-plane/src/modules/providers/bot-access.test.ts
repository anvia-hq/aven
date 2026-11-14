import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a bot's use of the person's providers (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { providers } = await import("@aven/db/schema/providers");
  const { users } = await import("@aven/db/schema/users");
  const { eq, inArray } = await import("drizzle-orm");
  const { botProviders } = await import("./bot-access");
  const { providersService } = await import("./service");
  const { InvalidSelectionError, resolveModel } = await import("./resolve-model");

  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `bot-prov-a-${suffix}`;
  const bob = `bot-prov-b-${suffix}`;
  let previousKey: string | undefined;
  let previousCatalogUrl: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.PROVIDER_ENCRYPTION_KEY;
    previousCatalogUrl = process.env.MODEL_CATALOG_URL;
    process.env.MODEL_CATALOG_URL = "";
    process.env.PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    await db.insert(users).values([
      { id: alice, name: "Alice", email: `${alice}@aven.test` },
      { id: bob, name: "Bob", email: `${bob}@aven.test` },
    ]);
  });
  afterAll(async () => {
    if (previousKey === undefined) delete process.env.PROVIDER_ENCRYPTION_KEY;
    else process.env.PROVIDER_ENCRYPTION_KEY = previousKey;

    if (previousCatalogUrl === undefined) delete process.env.MODEL_CATALOG_URL;
    else process.env.MODEL_CATALOG_URL = previousCatalogUrl;

    await db.delete(users).where(inArray(users.id, [alice, bob]));
  });

  const stored = async (id: string) =>
    (await db.select().from(providers).where(eq(providers.id, id)))[0]!;

  test("a provider a bot makes has no key and is not the default, even as the person's first", async () => {
    const added = await botProviders.add(alice, { kind: "anthropic", name: "Claude" });
    expect(added).toMatchObject({ kind: "anthropic", hasKey: false, isDefault: false });
    expect(added).not.toHaveProperty("keyHint");
    expect(await providersService.forRun(alice, undefined)).toBeUndefined();
  });

  test("a server of the person's own needs no key, so it can be the default at once", async () => {
    const added = await botProviders.add(alice, {
      kind: "openai-compatible",
      name: "Local",
      baseUrl: "http://localhost:4000/v1/",
      modelId: "llama",
    });
    expect(added).toMatchObject({ baseUrl: "http://localhost:4000/v1", hasKey: false });
    expect(await botProviders.update(alice, added.id, { isDefault: true })).toMatchObject({
      isDefault: true,
    });
  });

  test("what a kind needs is asked for in words the bot can act on", async () => {
    await expect(botProviders.add(alice, { kind: "azure", name: "Az" })).rejects.toThrow(
      /baseUrl|modelId/,
    );
    await expect(
      botProviders.add(alice, {
        kind: "azure",
        name: "Az",
        baseUrl: "http://plain.example.com",
        modelId: "gpt",
      }),
    ).rejects.toThrow(/baseUrl/);
  });

  test("a provider with no key cannot be made the default, nor be run", async () => {
    const [claude] = (await botProviders.list(alice)).filter((p) => p.name === "Claude");
    await expect(botProviders.update(alice, claude!.id, { isDefault: true })).rejects.toThrow(
      "key before making it the default",
    );
    await expect(resolveModel(alice, { providerId: claude!.id })).rejects.toBeInstanceOf(
      InvalidSelectionError,
    );
    await expect(botProviders.models(alice, claude!.id)).rejects.toThrow("no key yet");
  });

  test("once the person has given the key, it can be the default and a bot still cannot see it", async () => {
    const [claude] = (await botProviders.list(alice)).filter((p) => p.name === "Claude");
    await providersService.update(alice, claude!.id, { apiKey: "sk-ant-secret-wxyz" });
    const made = await botProviders.update(alice, claude!.id, { isDefault: true });
    expect(made).toMatchObject({ hasKey: true, isDefault: true });
    expect(JSON.stringify(made)).not.toContain("wxyz");
    expect(JSON.stringify(await botProviders.list(alice))).not.toContain("secret");
    expect(await resolveModel(alice, { providerId: claude!.id })).toMatchObject({
      apiKey: "sk-ant-secret-wxyz",
    });
  });

  test("moving a provider to another address drops its key, so it is never sent where a bot chose", async () => {
    const compat = await botProviders.add(alice, {
      kind: "openai-compatible",
      name: "Gateway",
      baseUrl: "https://good.example.com/v1",
      modelId: "m",
    });
    await providersService.update(alice, compat.id, { apiKey: "sk-gateway-keep-away" });
    expect((await stored(compat.id)).apiKeyEncrypted).not.toBeNull();
    await botProviders.update(alice, compat.id, { modelId: "m2" });
    expect((await stored(compat.id)).apiKeyEncrypted).not.toBeNull();
    const moved = await botProviders.update(alice, compat.id, {
      baseUrl: "https://evil.example.com/v1",
    });
    expect(moved.hasKey).toBe(false);
    expect(await stored(compat.id)).toMatchObject({ apiKeyEncrypted: null, keyHint: null });
  });

  test("a provider is found, changed and removed only by the person it belongs to", async () => {
    const [mine] = await botProviders.list(alice);
    expect(await botProviders.list(bob)).toEqual([]);
    await expect(botProviders.update(bob, mine!.id, { name: "Stolen" })).rejects.toThrow(
      "no provider with that id",
    );
    await expect(botProviders.remove(bob, mine!.id)).rejects.toThrow("no provider with that id");
    await expect(botProviders.keyFor(bob, mine!.id)).rejects.toThrow("no provider with that id");
    expect(await botProviders.keyFor(alice, mine!.id)).toEqual({
      providerId: mine!.id,
      name: mine!.name,
    });
  });
});
