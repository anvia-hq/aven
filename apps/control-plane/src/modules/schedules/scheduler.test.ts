import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("createScheduler (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { botSchedules } = await import("@aven/db/schema/bot-schedules");
  const { eq } = await import("drizzle-orm");
  const { botsService } = await import("../bots/service");
  const { createScheduler } = await import("./scheduler");
  const { schedulesService } = await import("./service");

  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `u-tick-${suffix}`;
  const HOUR = 3_600_000;
  const CREATED = new Date("2026-10-18T10:00:00Z");
  const DUE = new Date("2026-10-19T07:00:00Z");
  let botId = "";

  beforeAll(async () => {
    await db.insert(users).values({ id: alice, name: "Alice", email: `${alice}@aven.test` });
    const [main] = await botsService.list(alice);
    botId = main!.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, alice));
  });

  const made = (name: string) =>
    schedulesService.create(
      alice,
      botId,
      { name, cron: "0 7 * * *", prompt: `Do ${name}.`, timezone: "UTC" },
      CREATED,
    );
  const statusOf = async (id: string) => {
    const [row] = await db.select().from(botSchedules).where(eq(botSchedules.id, id));
    return row!;
  };
  const scheduler = (
    options: { busy?: boolean; refuse?: boolean; fired?: { botId: string; note: string }[] } = {},
  ) =>
    createScheduler({
      fire: async ({ botId: target }, note) => {
        if (options.refuse) throw new Error("the bot's computer is offline");

        options.fired?.push({ botId: target, note });
      },
      isBusy: () => options.busy ?? false,
      intervalMs: 60_000,
    });

  test("wakes the bot with the task when it is due, once, and goes on to the next day", async () => {
    const schedule = await made("on time");
    const fired: { botId: string; note: string }[] = [];
    const tick = scheduler({ fired });

    await tick.tick(new Date(DUE.getTime() - 60_000));
    expect(fired).toEqual([]);

    await tick.tick(new Date(DUE.getTime() + 30_000));
    await tick.tick(new Date(DUE.getTime() + 60_000));

    expect(fired).toHaveLength(1);
    expect(fired[0]!.botId).toBe(botId);
    expect(fired[0]!.note).toContain('Scheduled task "on time"');
    expect(fired[0]!.note).toContain("Do on time.");
    expect(fired[0]!.note).toContain("do not call ask_question");
    expect(fired[0]!.note).not.toContain("running late");
    const row = await statusOf(schedule.id);
    expect(row.lastStatus).toBe("started");
    expect(row.nextRunAt?.toISOString()).toBe("2026-10-20T07:00:00.000Z");
  });

  test("a task that is late is done and says so, and one that is too late is missed", async () => {
    const late = await made("late");
    const gone = await made("gone");
    const fired: { botId: string; note: string }[] = [];

    await scheduler({ fired }).tick(new Date(DUE.getTime() + HOUR));
    expect((await statusOf(late.id)).lastStatus).toBe("late");

    await db
      .update(botSchedules)
      .set({ nextRunAt: new Date(DUE.getTime() - 12 * HOUR) })
      .where(eq(botSchedules.id, gone.id));
    const before = fired.length;
    await scheduler({ fired }).tick(new Date(DUE.getTime() + HOUR));
    expect((await statusOf(gone.id)).lastStatus).toBe("missed");
    expect(fired.length).toBe(before);
    expect(fired.some((each) => each.note.includes("running late"))).toBe(true);
  });

  test("a bot that is busy, or cannot be woken, is told in the status and the next time goes on", async () => {
    const busy = await made("busy");
    const offline = await made("offline");
    const fired: { botId: string; note: string }[] = [];

    await scheduler({ busy: true, fired }).tick(new Date(DUE.getTime() + 30_000));
    expect(fired).toEqual([]);
    expect((await statusOf(busy.id)).lastStatus).toBe("busy");

    await db.update(botSchedules).set({ nextRunAt: DUE }).where(eq(botSchedules.id, offline.id));
    await scheduler({ refuse: true }).tick(new Date(DUE.getTime() + 30_000));
    const row = await statusOf(offline.id);
    expect(row.lastStatus).toBe("failed");
    expect(row.lastRunAt).toBeNull();
    expect(row.nextRunAt?.toISOString()).toBe("2026-10-20T07:00:00.000Z");
  });

  test("a paused schedule is not run", async () => {
    const paused = await made("paused");
    await schedulesService.update(alice, paused.id, { enabled: false }, CREATED);
    const fired: { botId: string; note: string }[] = [];

    await scheduler({ fired }).tick(new Date(DUE.getTime() + 30_000));

    expect(fired.filter((each) => each.note.includes('"paused"'))).toEqual([]);
  });
  test("two schedules of one bot that are due together both run, one after the other", async () => {
    const first = await made("first at eight");
    const second = await made("second at eight");
    const fired: { botId: string; note: string }[] = [];

    await scheduler({ fired }).tick(new Date(DUE.getTime() + 30_000));

    const notes = fired.map((each) => each.note);
    expect(notes.some((note) => note.includes('"first at eight"'))).toBe(true);
    expect(notes.some((note) => note.includes('"second at eight"'))).toBe(true);
    expect((await statusOf(first.id)).lastStatus).toBe("started");
    expect((await statusOf(second.id)).lastStatus).toBe("started");
  });

  test("a schedule that cannot be handled does not hold up the ones behind it", async () => {
    const broken = await made("broken");
    const fine = await made("fine");
    await db
      .update(botSchedules)
      .set({ nextRunAt: new Date(DUE.getTime() - 60_000), cron: "not a cron" })
      .where(eq(botSchedules.id, broken.id));
    const fired: { botId: string; note: string }[] = [];

    await scheduler({ fired }).tick(new Date(DUE.getTime() + 30_000));

    expect(fired.some((each) => each.note.includes('"fine"'))).toBe(true);
    expect((await statusOf(fine.id)).lastStatus).toBe("started");
  });

  test("two ticks at once run a schedule once", async () => {
    const once = await made("once");
    const fired: { botId: string; note: string }[] = [];
    const tick = scheduler({ fired });

    await Promise.all([
      tick.tick(new Date(DUE.getTime() + 30_000)),
      tick.tick(new Date(DUE.getTime() + 30_000)),
    ]);

    expect(fired.filter((each) => each.note.includes('"once"'))).toHaveLength(1);
    expect((await statusOf(once.id)).lastStatus).toBe("started");
  });
});
