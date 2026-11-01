import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("schedulesService (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { botSchedules } = await import("@aven/db/schema/bot-schedules");
  const { eq, inArray } = await import("drizzle-orm");
  const { SCHEDULES_LIMIT } = await import("@aven/protocol/schedules");
  const { NotFoundError, UnprocessableError } = await import("../../errors");
  const { botsService } = await import("../bots/service");
  const { preferencesService } = await import("../preferences/service");
  const { schedulesService } = await import("./service");

  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `u-sched-a-${suffix}`;
  const bob = `u-sched-b-${suffix}`;
  const NOW = new Date("2026-10-18T10:00:00Z");

  beforeAll(async () => {
    await db.insert(users).values([
      { id: alice, name: "Alice", email: `${alice}@aven.test` },
      { id: bob, name: "Bob", email: `${bob}@aven.test` },
    ]);
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [alice, bob]));
  });

  const daily = { name: "Morning news", cron: "0 7 * * *", prompt: "Read the news and tell me." };

  test("a schedule is made for the bot that asked, in the person's timezone, and is due at its next time", async () => {
    const [main] = await botsService.list(alice);
    await preferencesService.setTimezone(alice, "Asia/Jakarta");

    const made = await schedulesService.create(alice, main!.id, daily, NOW);

    expect(made).toMatchObject({
      bot: "main",
      name: "Morning news",
      cron: "0 7 * * *",
      timezone: "Asia/Jakarta",
      enabled: true,
      lastRun: null,
    });
    expect(made.nextRun).toStartWith("2026-10-19T00:00:00.000Z");
    expect((await schedulesService.list(alice)).map((each) => each.id)).toContain(made.id);
  });

  test("a schedule may be for another of the person's bots, by handle, and for none that is not theirs", async () => {
    const [main] = await botsService.list(alice);
    const scout = await botsService.create(alice, { name: "Scout", instruction: "x" });

    const made = await schedulesService.create(
      alice,
      main!.id,
      { ...daily, name: "For Scout", bot: `@${scout.handle}` },
      NOW,
    );
    expect(made.bot).toBe(scout.handle);

    await botsService.list(bob);
    await expect(
      schedulesService.create(alice, main!.id, { ...daily, bot: "ghost" }, NOW),
    ).rejects.toBeInstanceOf(UnprocessableError);
  });

  test("a cron that is wrong, never runs, runs too often or has a timezone that is not one is refused", async () => {
    const [main] = await botsService.list(alice);
    const refuses = (input: Partial<typeof daily> & { timezone?: string }) =>
      expect(
        schedulesService.create(alice, main!.id, { ...daily, ...input }, NOW),
      ).rejects.toBeInstanceOf(UnprocessableError);

    await refuses({ cron: "every day" });
    await refuses({ cron: "0 0 31 2 *" });
    await refuses({ cron: "*/5 * * * *" });
    // Too close at some time of the day, though the next few runs from now are far enough apart.
    await refuses({ cron: "0,30,40 * * * *" });
    await refuses({ cron: "0,10,30 7 * * *" });
    await refuses({ timezone: "Mars/Olympus" });
  });

  test("it can be paused, and then has no next time, resumed, changed and deleted, by its person only", async () => {
    const [main] = await botsService.list(alice);
    const made = await schedulesService.create(alice, main!.id, daily, NOW);

    const paused = await schedulesService.update(alice, made.id, { enabled: false }, NOW);
    expect(paused).toMatchObject({ enabled: false, nextRun: null });

    const resumed = await schedulesService.update(alice, made.id, { enabled: true }, NOW);
    expect(resumed.nextRun).not.toBeNull();

    const changed = await schedulesService.update(
      alice,
      made.id,
      { cron: "30 8 * * mon-fri", name: "Weekday news" },
      NOW,
    );
    expect(changed).toMatchObject({
      cron: "30 8 * * mon-fri",
      name: "Weekday news",
      prompt: daily.prompt,
    });

    await expect(
      schedulesService.update(bob, made.id, { enabled: false }, NOW),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(schedulesService.remove(bob, made.id)).rejects.toBeInstanceOf(NotFoundError);
    await schedulesService.remove(alice, made.id);
    expect((await schedulesService.list(alice)).map((each) => each.id)).not.toContain(made.id);
  });

  test("changing what it says, or whose it is, keeps its next time, and changing its clock finds it again", async () => {
    const [main] = await botsService.list(alice);
    const scout = await botsService.create(alice, { name: "Pilot", instruction: "x" });
    const made = await schedulesService.create(alice, main!.id, { ...daily, bot: "@Main" }, NOW);
    expect(made.bot).toBe("main");

    const moved = await schedulesService.update(
      alice,
      made.id,
      { prompt: "A new task.", bot: scout.handle },
      new Date(NOW.getTime() + 3_600_000),
    );
    expect(moved).toMatchObject({ bot: scout.handle, prompt: "A new task." });
    expect(moved.nextRun).toBe(made.nextRun);

    const elsewhere = await schedulesService.update(alice, made.id, { timezone: "UTC" }, NOW);
    expect(elsewhere.nextRun).toStartWith("2026-10-19T07:00:00.000Z");
  });

  test("a schedule that was paused past its time runs next at its next time, not at once", async () => {
    const [main] = await botsService.list(alice);
    const made = await schedulesService.create(alice, main!.id, { ...daily, timezone: "UTC" }, NOW);
    await schedulesService.update(alice, made.id, { enabled: false }, NOW);

    const later = new Date("2026-10-25T12:00:00Z");
    const resumed = await schedulesService.update(alice, made.id, { enabled: true }, later);

    expect(resumed.nextRun).toStartWith("2026-10-26T07:00:00.000Z");
  });

  test("a person has only so many, even when they are made at once", async () => {
    const carol = `u-sched-c-${suffix}`;
    await db.insert(users).values({ id: carol, name: "Carol", email: `${carol}@aven.test` });
    try {
      const [main] = await botsService.list(carol);
      const attempts = await Promise.allSettled(
        Array.from({ length: SCHEDULES_LIMIT + 5 }, (_, i) =>
          schedulesService.create(carol, main!.id, { ...daily, name: `Task ${i}` }, NOW),
        ),
      );
      expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(
        SCHEDULES_LIMIT,
      );
      expect(await db.$count(botSchedules, eq(botSchedules.userId, carol))).toBe(SCHEDULES_LIMIT);
    } finally {
      await db.delete(users).where(eq(users.id, carol));
    }
  });
});
