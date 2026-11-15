import { afterAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("codexSetupService (postgres)", async () => {
  if (!process.env.DATABASE_URL) return;

  const { db } = await import("@aven/db/client");
  const { codexSetupTokens } = await import("@aven/db/schema/codex-setup-tokens");
  const { users } = await import("@aven/db/schema/users");
  const { inArray } = await import("drizzle-orm");
  const { codexSetupService } = await import("./service");

  const alice = `alice-${crypto.randomUUID()}`;
  const bob = `bob-${crypto.randomUUID()}`;
  const aliceToken = `sk-alice-${"a".repeat(24)}`;
  const bobToken = `sk-bob-${"b".repeat(24)}`;

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [alice, bob]));
  });

  await db.insert(users).values([
    { id: alice, name: "Alice", email: `${alice}@example.com` },
    { id: bob, name: "Bob", email: `${bob}@example.com` },
  ]);

  test("keeps each person's key to that person, and never returns it", async () => {
    await codexSetupService.save(alice, aliceToken);
    await codexSetupService.save(bob, bobToken);

    expect(await codexSetupService.tokenFor(alice)).toBe(aliceToken);
    expect(await codexSetupService.tokenFor(bob)).toBe(bobToken);
    expect(await codexSetupService.tokenFor(alice)).not.toBe(bobToken);

    const view = await codexSetupService.view(alice);
    expect(view).toEqual({ configured: true, hint: aliceToken.slice(-4) });
    expect(JSON.stringify(view)).not.toContain(aliceToken);
    expect(JSON.stringify(await codexSetupService.view(bob))).not.toContain(aliceToken);

    const stored = await db
      .select({ tokenEncrypted: codexSetupTokens.tokenEncrypted })
      .from(codexSetupTokens)
      .where(inArray(codexSetupTokens.userId, [alice, bob]));
    expect(stored).toHaveLength(2);
    for (const row of stored) {
      expect(row.tokenEncrypted).not.toContain(aliceToken);
      expect(row.tokenEncrypted).not.toContain(bobToken);
    }

    await codexSetupService.save(alice, `${aliceToken}replaced`);
    expect(await codexSetupService.tokenFor(alice)).toBe(`${aliceToken}replaced`);
    expect(await codexSetupService.tokenFor(bob)).toBe(bobToken);

    expect(await codexSetupService.remove(alice)).toBe(true);
    expect(await codexSetupService.tokenFor(alice)).toBeUndefined();
    expect(await codexSetupService.view(alice)).toEqual({ configured: false, hint: null });
    expect(await codexSetupService.tokenFor(bob)).toBe(bobToken);
    expect(await codexSetupService.remove(alice)).toBe(false);
  });
});
