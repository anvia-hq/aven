import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { users } from "@aven/db/schema/users";
import { inArray } from "drizzle-orm";

import { botRunChoice } from "./bot-run-choice";
import { providersService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const CLAUDE_TOKEN = `sk-ant-oat01-${"a".repeat(24)}`;

run("what runs a bot (postgres)", async () => {
  const person = `person-${crypto.randomUUID()}`;

  await db.insert(users).values({ id: person, name: "Pim", email: `${person}@example.com` });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [person]));
  });

  const settings = (
    changed: Partial<{ providerId: string; modelId: string; reasoningEffort: string }>,
  ) => ({
    providerId: null,
    modelId: null,
    reasoningEffort: null,
    ...changed,
  });

  test("a bot with no provider of its own follows the person's default, subscription included", async () => {
    const claude = await providersService.create(person, {
      kind: "claude-subscription",
      name: "Claude subscription",
      apiKey: CLAUDE_TOKEN,
      modelId: "sonnet",
      isDefault: true,
    });

    expect(await botRunChoice(person, settings({}))).toEqual({
      backend: "claude",
      token: CLAUDE_TOKEN,
      modelId: "sonnet",
      effort: undefined,
    });

    const native = await providersService.create(person, {
      kind: "anthropic",
      name: "Anthropic",
      apiKey: `sk-ant-${"b".repeat(40)}`,
    });

    expect(
      await botRunChoice(person, settings({ providerId: native.id, modelId: "claude-sonnet-4-5" })),
    ).toMatchObject({
      backend: "native",
      model: { provider: "anthropic", modelId: "claude-sonnet-4-5" },
    });

    expect(
      await botRunChoice(
        person,
        settings({ providerId: claude.id, modelId: "opus", reasoningEffort: "max" }),
      ),
    ).toMatchObject({ backend: "claude", modelId: "opus", effort: "max" });
  });

  test("a model or effort the subscription does not take is refused", async () => {
    const [claude] = await providersService.list(person);

    await expect(
      botRunChoice(person, settings({ providerId: claude!.id, modelId: "gpt-6-astra" })),
    ).rejects.toThrow("not a model of this provider");
    await expect(
      botRunChoice(
        person,
        settings({ providerId: claude!.id, modelId: "opus", reasoningEffort: "ultra" }),
      ),
    ).rejects.toThrow('does not take the "ultra" reasoning effort');
  });

  test("a bot whose subscription is gone says so rather than running on the wrong agent", async () => {
    const [claude] = await providersService.list(person);
    await providersService.remove(person, claude!.id);

    await expect(
      botRunChoice(person, settings({ providerId: claude!.id, modelId: "opus" })),
    ).resolves.toMatchObject({ backend: "native" });
  });
});
