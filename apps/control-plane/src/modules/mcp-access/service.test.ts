import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { users } from "@aven/db/schema/users";
import { ACCESS_LIMIT } from "@aven/protocol/mcp-access";
import { eq } from "drizzle-orm";

import { ConflictError } from "@aven/server-kit/errors";
import { createAccessTokenBody } from "./schema";
import { mcpAccessService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const make = (name: string, ...permissions: string[]) =>
  createAccessTokenBody.parse({ name, permissions });

run("mcpAccessService (postgres)", async () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `acc-a-${suffix}`;
  const bob = `acc-b-${suffix}`;
  await db.insert(users).values([
    { id: alice, name: "Alice", email: `${alice}@aven.test` },
    { id: bob, name: "Bob", email: `${bob}@aven.test` },
  ]);
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, alice));
    await db.delete(users).where(eq(users.id, bob));
  });

  test("shows a token once, and keeps only its hint after that", async () => {
    const created = await mcpAccessService.create(alice, make("Grokbot", "read", "change"));
    expect(created.token.startsWith("avn_")).toBe(true);
    expect(created).toMatchObject({
      name: "Grokbot",
      hint: created.token.slice(-4),
      permissions: ["read", "change"],
    });
    const listed = await mcpAccessService.list(alice);
    expect(JSON.stringify(listed)).not.toContain(created.token);
    expect(listed.map((item) => item.name)).toContain("Grokbot");
  });

  test("knows a token's owner and permissions, and nobody else's", async () => {
    const created = await mcpAccessService.create(alice, make("Reader", "read"));
    expect(await mcpAccessService.authenticate(created.token)).toMatchObject({
      userId: alice,
      permissions: ["read"],
    });
    expect(await mcpAccessService.authenticate(`${created.token}x`)).toBeUndefined();
    expect(await mcpAccessService.authenticate("not-a-token")).toBeUndefined();
    expect(
      (await mcpAccessService.list(alice)).find((i) => i.id === created.id)?.lastUsedAt,
    ).not.toBeNull();
    expect(await mcpAccessService.list(bob)).toEqual([]);
  });

  test("stops a token working when it is removed, and only its owner can remove it", async () => {
    const created = await mcpAccessService.create(alice, make("Temporary", "read"));
    expect(await mcpAccessService.remove(bob, created.id)).toBe(false);
    expect(await mcpAccessService.authenticate(created.token)).toBeDefined();
    expect(await mcpAccessService.remove(alice, created.id)).toBe(true);
    expect(await mcpAccessService.authenticate(created.token)).toBeUndefined();
  });

  test("limits how many tokens a person has", async () => {
    const carol = `acc-c-${suffix}`;
    await db.insert(users).values({ id: carol, name: "Carol", email: `${carol}@aven.test` });
    try {
      for (let i = 0; i < ACCESS_LIMIT; i++)
        await mcpAccessService.create(carol, make(`t${i}`, "read"));

      await expect(mcpAccessService.create(carol, make("one more", "read"))).rejects.toThrow(
        ConflictError,
      );
    } finally {
      await db.delete(users).where(eq(users.id, carol));
    }
  });

  test("refuses no permissions and a permission that does not exist", () => {
    expect(() => make("Nothing")).toThrow();
    expect(() => make("Odd", "admin")).toThrow();
  });
});
