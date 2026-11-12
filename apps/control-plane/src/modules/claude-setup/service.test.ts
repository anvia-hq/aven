import { afterAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("claudeSetupService (postgres)", async () => {
  if (!process.env.DATABASE_URL) return;

  const { db } = await import("@aven/db/client");
  const { claudeSetupTokens } = await import("@aven/db/schema/claude-setup-tokens");
  const { users } = await import("@aven/db/schema/users");
  const { inArray } = await import("drizzle-orm");
  const { claudeSetupService } = await import("./service");

  const alice = `alice-${crypto.randomUUID()}`;
  const bob = `bob-${crypto.randomUUID()}`;
  const aliceToken = `setup-token-alice-${"a".repeat(24)}`;
  const bobToken = `setup-token-bob-${"b".repeat(24)}`;

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [alice, bob]));
  });

  await db.insert(users).values([
    { id: alice, name: "Alice", email: `${alice}@example.com` },
    { id: bob, name: "Bob", email: `${bob}@example.com` },
  ]);

  test("keeps each person's token to that person, and never returns it", async () => {
    await claudeSetupService.save(alice, aliceToken);
    await claudeSetupService.save(bob, bobToken);

    expect(await claudeSetupService.tokenFor(alice)).toBe(aliceToken);
    expect(await claudeSetupService.tokenFor(bob)).toBe(bobToken);
    expect(await claudeSetupService.tokenFor(alice)).not.toBe(bobToken);

    const view = await claudeSetupService.view(alice);
    expect(view).toEqual({ configured: true, hint: aliceToken.slice(-4) });
    expect(JSON.stringify(view)).not.toContain(aliceToken);
    expect(JSON.stringify(await claudeSetupService.view(bob))).not.toContain(aliceToken);

    const stored = await db
      .select({ tokenEncrypted: claudeSetupTokens.tokenEncrypted })
      .from(claudeSetupTokens)
      .where(inArray(claudeSetupTokens.userId, [alice, bob]));
    expect(stored).toHaveLength(2);
    for (const row of stored) {
      expect(row.tokenEncrypted).not.toContain(aliceToken);
      expect(row.tokenEncrypted).not.toContain(bobToken);
    }

    await claudeSetupService.save(alice, `${aliceToken}replaced`);
    expect(await claudeSetupService.tokenFor(alice)).toBe(`${aliceToken}replaced`);
    expect(await claudeSetupService.tokenFor(bob)).toBe(bobToken);

    expect(await claudeSetupService.remove(alice)).toBe(true);
    expect(await claudeSetupService.tokenFor(alice)).toBeUndefined();
    expect(await claudeSetupService.view(alice)).toEqual({ configured: false, hint: null });
    expect(await claudeSetupService.tokenFor(bob)).toBe(bobToken);
    expect(await claudeSetupService.remove(alice)).toBe(false);
  });
});
