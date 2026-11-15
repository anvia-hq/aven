import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { users } from "@aven/db/schema/users";
import { inArray } from "drizzle-orm";

import { providersService } from "./service";
import { selectionForThread } from "./selection";

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
