import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("providersService (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { inArray } = await import("drizzle-orm");
  const { UnavailableError } = await import("../../errors");
  const { providersService } = await import("./service");
  const { effortsByModel } = await import("./model-list");
  const { InvalidSelectionError, resolveModel } = await import("./resolve-model");

  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `u-alice-${suffix}`;
  const bob = `u-bob-${suffix}`;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.PROVIDER_ENCRYPTION_KEY;
    process.env.MODEL_CATALOG_URL = "";
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
    expect(await resolveModel(bob)).toBeNull();
  });

  test("resolveModel decrypts the default provider's key", async () => {
    expect(await resolveModel(alice)).toEqual({
      provider: "openai",
      modelId: undefined,
      baseUrl: undefined,
      apiKey: "sk-secret-abcd",
    });
  });

  test("a key that cannot be decrypted makes the provider unavailable, not a server error", async () => {
    const original = process.env.PROVIDER_ENCRYPTION_KEY;
    process.env.PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const silenced = console.error;
    console.error = () => undefined;
    try {
      await expect(resolveModel(alice)).rejects.toBeInstanceOf(UnavailableError);
    } finally {
      console.error = silenced;
      process.env.PROVIDER_ENCRYPTION_KEY = original;
    }
  });

  test("a message may choose its own provider, model and effort, but never someone else's", async () => {
    const [mine] = await providersService.list(alice);
    const chosen = await resolveModel(alice, {
      providerId: mine!.id,
      modelId: "o3",
      reasoningEffort: "low",
    });
    expect(chosen).toMatchObject({ provider: "openai", modelId: "o3", reasoningEffort: "low" });

    await expect(resolveModel(bob, { providerId: mine!.id })).rejects.toThrow(
      InvalidSelectionError,
    );
    await expect(
      resolveModel(alice, {
        providerId: mine!.id,
        modelId: "o3",
        reasoningEffort: "max",
      }),
    ).rejects.toThrow("does not support");
    await expect(
      resolveModel(alice, {
        providerId: mine!.id,
        modelId: "gpt-4o",
        reasoningEffort: "low",
      }),
    ).rejects.toThrow("does not support");
    // Models that are not chat models are refused before a run starts.
    await expect(
      resolveModel(alice, {
        providerId: mine!.id,
        modelId: "text-embedding-3-small",
      }),
    ).rejects.toThrow("cannot be used");
    // A choice with no provider to apply it to is refused rather than silently dropped.
    await expect(resolveModel(bob, { reasoningEffort: "low" })).rejects.toThrow("Add a provider");
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
    expect((await resolveModel(alice))?.provider).toBe("openai-compatible");

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

  test("an Azure provider keeps its resource origin and deployment, and offers its deployment first, then the deployments the resource lists", async () => {
    const asked: { url: string; key: string | null }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
      asked.push({ url: String(input), key: new Headers(init?.headers).get("api-key") });
      return Response.json({
        data: [
          { id: "gpt-4o", model: "gpt-4o", status: "succeeded" },
          { id: "gpt-5-deploy", model: "gpt-5", status: "succeeded" },
          { id: "still-creating", model: "gpt-5", status: "creating" },
        ],
      });
    }) as typeof fetch;
    const azure = await providersService.create(alice, {
      kind: "azure",
      name: "Azure",
      baseUrl: "https://my-resource.openai.azure.com",
      modelId: "gpt-5-deploy",
      apiKey: "azure-secret-1234",
    });
    expect(azure.baseUrl).toBe("https://my-resource.openai.azure.com");
    expect(azure.keyHint).toBe("1234");
    try {
      expect(await providersService.listModels(alice, azure.id)).toMatchObject({
        models: ["gpt-5-deploy", "gpt-4o"],
      });
      expect(asked).toEqual([
        {
          url: "https://my-resource.openai.azure.com/openai/deployments?api-version=2022-12-01",
          key: "azure-secret-1234",
        },
      ]);
      globalThis.fetch = (async () =>
        new Response("no", { status: 500 })) as unknown as typeof fetch;
      expect(await providersService.listModels(alice, azure.id)).toMatchObject({
        models: ["gpt-5-deploy"],
      });
    } finally {
      globalThis.fetch = realFetch;
    }
    await expect(
      providersService.update(alice, azure.id, { baseUrl: "http://my-resource.example.com" }),
    ).rejects.toThrow("https");
    await expect(providersService.update(alice, azure.id, { modelId: null })).rejects.toThrow(
      "needs a model id",
    );
    const config = await resolveModel(alice, { providerId: azure.id });
    expect(config).toMatchObject({
      provider: "azure",
      modelId: "gpt-5-deploy",
      baseUrl: "https://my-resource.openai.azure.com",
      apiKey: "azure-secret-1234",
    });
  });

  test("OpenAI, Anthropic and Azure each take one credential, compatible servers many", async () => {
    await expect(
      providersService.create(alice, {
        kind: "azure",
        name: "Azure again",
        baseUrl: "https://other.openai.azure.com",
        modelId: "d2",
        apiKey: "k",
      }),
    ).rejects.toThrow("already connected");
    const compat = {
      kind: "openai-compatible",
      baseUrl: "http://localhost:1/v1",
      modelId: "m",
    } as const;
    await providersService.create(alice, { ...compat, name: "C3" });
    await providersService.create(alice, { ...compat, name: "C4" });
  });

  test("model efforts come from the SDK and leave out models without the control", async () => {
    expect(await effortsByModel({ kind: "openai" }, ["gpt-4o", "o3"])).toEqual({
      o3: { options: ["low", "medium", "high"], defaultValue: "medium" },
    });
    expect(await effortsByModel({ kind: "openai-compatible" }, ["llama3"])).toEqual({});
  });
});
