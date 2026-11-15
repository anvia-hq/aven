import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { providers } from "@aven/db/schema/providers";
import { users } from "@aven/db/schema/users";
import { inArray } from "drizzle-orm";

import { CLAUDE_BACKEND_OFF } from "./backends";
import { providersService } from "./service";
import { requireSubscriptionToken, SubscriptionTokenMissingError } from "./token";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const CLAUDE_TOKEN = `sk-ant-oat01-${"a".repeat(24)}`;
const CODEX_KEY = `sk-${"b".repeat(40)}`;

run("a subscription as a provider (postgres)", async () => {
  const alice = `alice-${crypto.randomUUID()}`;
  const bob = `bob-${crypto.randomUUID()}`;

  await db.insert(users).values([
    { id: alice, name: "Alice", email: `${alice}@example.com` },
    { id: bob, name: "Bob", email: `${bob}@example.com` },
  ]);

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [alice, bob]));
  });

  const kept = {
    claude: process.env.AVEN_CLAUDE_BACKEND,
    codex: process.env.AVEN_CODEX_BACKEND,
  };

  function restore(name: "AVEN_CLAUDE_BACKEND" | "AVEN_CODEX_BACKEND", value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  afterAll(() => {
    restore("AVEN_CLAUDE_BACKEND", kept.claude);
    restore("AVEN_CODEX_BACKEND", kept.codex);
  });

  let aliceToken = CLAUDE_TOKEN;

  const addClaude = (userId: string, apiKey = CLAUDE_TOKEN, isDefault = false) =>
    providersService.create(userId, {
      kind: "claude-subscription",
      name: "Claude subscription",
      apiKey,
      isDefault,
    });

  test("keeps each person's token to that person, encrypted, and hands it back only to a run", async () => {
    const mine = await addClaude(alice);
    await providersService.create(bob, {
      kind: "codex-subscription",
      name: "Codex subscription",
      apiKey: CODEX_KEY,
    });

    expect(await providersService.tokenFor(alice, "claude")).toBe(CLAUDE_TOKEN);
    expect(await providersService.tokenFor(alice, "codex")).toBeUndefined();
    expect(await providersService.tokenFor(bob, "codex")).toBe(CODEX_KEY);

    expect(mine).toMatchObject({
      kind: "claude-subscription",
      backend: "claude",
      hasKey: true,
      keyHint: CLAUDE_TOKEN.slice(-4),
    });
    expect(JSON.stringify(mine)).not.toContain(CLAUDE_TOKEN);

    const stored = await db
      .select({ apiKeyEncrypted: providers.apiKeyEncrypted })
      .from(providers)
      .where(inArray(providers.userId, [alice, bob]));

    for (const row of stored) {
      expect(row.apiKeyEncrypted).not.toContain(CLAUDE_TOKEN);
      expect(row.apiKeyEncrypted).not.toContain(CODEX_KEY);
    }
  });

  test("a person has one of a kind, and it can be their default", async () => {
    await expect(addClaude(alice, `sk-ant-oat01-${"c".repeat(24)}`)).rejects.toThrow(
      "already connected",
    );

    const [row] = await providersService.list(alice);
    const chosen = await providersService.update(alice, row!.id, { isDefault: true });

    expect(chosen?.isDefault).toBe(true);
    expect((await providersService.forRun(alice, undefined))?.kind).toBe("claude-subscription");
  });

  test("its models are the hosted backend's, with the efforts it takes", async () => {
    const [row] = await providersService.list(alice);
    const catalog = (await providersService.listModels(alice, row!.id))!;

    expect(catalog.models).toContain("default");
    expect(catalog.models).toContain("sonnet");
    expect(catalog.labels.sonnet).toContain("Sonnet");
    expect(catalog.efforts.default?.options).toContain("medium");
  });

  test("a replacement key must be the kind the row is", async () => {
    const [row] = await providersService.list(alice);

    await expect(
      providersService.update(alice, row!.id, { apiKey: `sk-${"e".repeat(40)}` }),
    ).rejects.toThrow("sk-ant-oat01-");
    await expect(
      providersService.update(alice, row!.id, { apiKey: "not-a-claude-token-at-all" }),
    ).rejects.toThrow("sk-ant-oat01-");

    aliceToken = `sk-ant-oat01-${"f".repeat(24)}`;
    expect((await providersService.update(alice, row!.id, { apiKey: aliceToken }))?.keyHint).toBe(
      aliceToken.slice(-4),
    );
    expect(await providersService.tokenFor(alice, "claude")).toBe(aliceToken);
  });

  test("a native thread asks for a native provider, even when the default is a subscription", async () => {
    const [defaultRow] = await providersService.list(alice);

    expect(defaultRow?.isDefault).toBe(true);
    expect(await providersService.forNativeRun(alice, undefined)).toBeUndefined();

    const native = await providersService.create(alice, {
      kind: "anthropic",
      name: "Anthropic",
      apiKey: `sk-ant-${"d".repeat(40)}`,
    });

    expect((await providersService.forNativeRun(alice, undefined))?.id).toBe(native.id);
    expect((await providersService.forRun(alice, undefined))?.id).toBe(defaultRow!.id);
  });

  test("a backend that is turned off refuses its kind, and a token that is missing says so", async () => {
    process.env.AVEN_CLAUDE_BACKEND = "off";

    await expect(
      providersService.create(bob, {
        kind: "claude-subscription",
        name: "Claude subscription",
        apiKey: CLAUDE_TOKEN,
      }),
    ).rejects.toThrow(CLAUDE_BACKEND_OFF);

    process.env.AVEN_CLAUDE_BACKEND = "on";

    await expect(requireSubscriptionToken(bob, "claude")).rejects.toBeInstanceOf(
      SubscriptionTokenMissingError,
    );
    expect(await requireSubscriptionToken(alice, "claude")).toBe(aliceToken);
    expect(await requireSubscriptionToken(alice, "native")).toBeUndefined();
  });
});
