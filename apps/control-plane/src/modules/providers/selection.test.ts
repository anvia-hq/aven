import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { users } from "@aven/db/schema/users";
import { inArray } from "drizzle-orm";

import { providersService } from "./service";
import { selectionForRun, selectionForThread } from "./selection";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("the model a thread runs with (postgres)", async () => {
  const alice = `alice-${crypto.randomUUID()}`;

  await db.insert(users).values({ id: alice, name: "Alice", email: `${alice}@example.com` });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [alice]));
  });

  test("another agent's provider is dropped rather than failing the message", async () => {
    const native = await providersService.create(alice, {
      kind: "anthropic",
      name: "Anthropic",
      apiKey: `sk-ant-${"a".repeat(40)}`,
    });
    const claude = await providersService.create(alice, {
      kind: "claude-subscription",
      name: "Claude subscription",
      apiKey: `sk-ant-oat01-${"b".repeat(24)}`,
    });
    const chosen = { providerId: claude.id, modelId: "opus", reasoningEffort: "max" };

    expect(await selectionForThread(alice, "claude", chosen)).toEqual(chosen);
    expect(await selectionForThread(alice, "native", chosen)).toEqual({});
    expect(
      await selectionForThread(alice, "claude", { providerId: native.id, modelId: "claude-x" }),
    ).toEqual({});
  });

  test("a selection with no provider is left as it is, and one of another person's is dropped", async () => {
    const [native] = await providersService.list(alice);
    const other = `bob-${crypto.randomUUID()}`;

    await db.insert(users).values({ id: other, name: "Bob", email: `${other}@example.com` });

    try {
      expect(await selectionForThread(alice, "native", {})).toEqual({});
      expect(
        await selectionForThread(other, "native", { providerId: native!.id, modelId: "m" }),
      ).toEqual({});
    } finally {
      await db.delete(users).where(inArray(users.id, [other]));
    }
  });
});

run("the model a run starts with (postgres)", async () => {
  const carol = `carol-${crypto.randomUUID()}`;

  await db.insert(users).values({ id: carol, name: "Carol", email: `${carol}@example.com` });

  const anthropic = await providersService.create(carol, {
    kind: "anthropic",
    name: "Anthropic",
    apiKey: `sk-ant-${"a".repeat(40)}`,
  });
  const gateway = await providersService.create(carol, {
    kind: "openai-compatible",
    name: "Gateway",
    baseUrl: "https://gateway.example.com/v1",
    modelId: "gateway-model",
    apiKey: "gateway-key",
    isDefault: true,
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [carol]));
  });

  const unset = {
    agentBackend: "native" as const,
    modelProviderId: null,
    modelId: null,
    reasoningEffort: null,
  };

  test("a thread keeps its own provider while another one is the default", async () => {
    const thread = {
      ...unset,
      modelProviderId: anthropic.id,
      modelId: "claude-sonnet-5-5",
      reasoningEffort: "high",
    };

    expect(await selectionForRun(carol, thread, {})).toEqual({
      providerId: anthropic.id,
      modelId: "claude-sonnet-5-5",
      reasoningEffort: "high",
    });
    expect(await selectionForRun(carol, thread, { modelId: "claude-opus-5-5" })).toEqual({
      providerId: anthropic.id,
      modelId: "claude-opus-5-5",
      reasoningEffort: "high",
    });
  });

  test("what the message asks for wins over what the thread kept", async () => {
    const thread = { ...unset, modelProviderId: anthropic.id, modelId: "claude-sonnet-5-5" };
    const asked = { providerId: gateway.id, modelId: "gateway-model" };

    expect(await selectionForRun(carol, thread, asked)).toEqual(asked);
  });

  test("a thread that has not chosen yet is pinned to the default of that moment", async () => {
    expect(await selectionForRun(carol, unset, {})).toEqual({ providerId: gateway.id });
  });

  test("a kept provider that is gone falls back to the default", async () => {
    const thread = { ...unset, modelProviderId: crypto.randomUUID(), modelId: "old" };

    expect(await selectionForRun(carol, thread, {})).toEqual({ providerId: gateway.id });
  });
});
