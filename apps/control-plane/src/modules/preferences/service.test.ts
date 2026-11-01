import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("preferencesService (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { eq } = await import("drizzle-orm");
  const { UnprocessableError } = await import("../../errors");
  const { preferencesService } = await import("./service");

  const alice = `u-pref-${crypto.randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    await db.insert(users).values({ id: alice, name: "Alice", email: `${alice}@aven.test` });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, alice));
  });

  test("a person has the server's timezone until they choose one, and then theirs, which can change", async () => {
    const first = await preferencesService.get(alice);
    expect(first.timezone).toBeNull();
    expect(await preferencesService.timezone(alice)).toBe(first.defaultTimezone);

    await preferencesService.setTimezone(alice, "Asia/Jakarta");
    expect(await preferencesService.timezone(alice)).toBe("Asia/Jakarta");
    await preferencesService.setTimezone(alice, "America/New_York");
    expect((await preferencesService.get(alice)).timezone).toBe("America/New_York");
  });

  test("a name that is not a timezone is refused, and the choice stays", async () => {
    await preferencesService.setTimezone(alice, "Europe/Paris");
    await expect(preferencesService.setTimezone(alice, "Mars/Olympus")).rejects.toBeInstanceOf(
      UnprocessableError,
    );
    expect(await preferencesService.timezone(alice)).toBe("Europe/Paris");
  });
  test("a browser's timezone is kept only when none is chosen, and never replaces a choice", async () => {
    const bea = `u-pref-b-${crypto.randomUUID().slice(0, 8)}`;
    await db.insert(users).values({ id: bea, name: "Bea", email: `${bea}@aven.test` });
    try {
      expect(await preferencesService.setDefaultTimezone(bea, "Asia/Tokyo")).toEqual({
        timezone: "Asia/Tokyo",
      });

      await preferencesService.setTimezone(bea, "Europe/Paris");
      expect(await preferencesService.setDefaultTimezone(bea, "Asia/Tokyo")).toEqual({
        timezone: "Europe/Paris",
      });
      await expect(
        preferencesService.setDefaultTimezone(bea, "Mars/Olympus"),
      ).rejects.toBeInstanceOf(UnprocessableError);
    } finally {
      await db.delete(users).where(eq(users.id, bea));
    }
  });
});
