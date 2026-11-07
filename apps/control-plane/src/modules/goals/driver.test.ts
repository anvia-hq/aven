import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("createGoalDriver (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { inArray } = await import("drizzle-orm");
  const { botNote } = await import("@aven/protocol/bots");
  const { botsService } = await import("../bots/service");
  const { createGoalDriver } = await import("./driver");
  const { goalsService } = await import("./service");

  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `u-drive-${suffix}`;

  beforeAll(async () => {
    await db.insert(users).values({ id: alice, name: "Alice", email: `${alice}@aven.test` });
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [alice]));
  });

  async function setup(options: { maxRounds?: number; idle?: boolean } = {}) {
    const bot = await botsService.create(alice, {
      name: `Bot ${crypto.randomUUID().slice(0, 4)}`,
      instruction: "x",
    });
    await goalsService.start(alice, bot.id, {
      objective: "Port the parser",
      checks: ["bun test"],
      maxRounds: options.maxRounds,
    });
    const woken: { botId: string; note: string }[] = [];
    const state = { refuse: false, idle: options.idle ?? true };
    const driver = createGoalDriver({
      wake: async (_userId, botId, note) => {
        if (state.refuse) throw new Error("the computer is offline");
        woken.push({ botId, note });
      },
      isIdle: (botId) => botId === bot.id && state.idle,
      intervalMs: 60_000,
    });
    return { bot, driver, woken, state };
  }

  test("a round wakes the bot with the objective and the checks, and is counted", async () => {
    const { bot, driver, woken } = await setup();

    await driver.advance(alice, bot.id);

    expect(woken).toHaveLength(1);
    const note = woken[0]!.note;
    expect(note).toStartWith("Goal round 1 of 20.");
    expect(note).toContain("Objective: Port the parser");
    expect(note).toContain("- bun test");
    expect(note).toContain("do not call ask_question");
    expect((await goalsService.get(bot.id))?.round).toBe(1);
  });

  test("a goal with no checks says the bot judges when it is done", async () => {
    const { bot, driver, woken } = await setup();
    await goalsService.update(bot.id, "clear");
    await goalsService.start(alice, bot.id, { objective: "Think", checks: [] });

    await driver.advance(alice, bot.id);

    expect(woken[0]!.note).toContain("There are no automatic checks");
  });

  test("a round that could not start is not counted, and the goal goes on", async () => {
    const { bot, driver, woken, state } = await setup();
    state.refuse = true;

    await driver.advance(alice, bot.id);

    expect(woken).toEqual([]);
    expect(await goalsService.get(bot.id)).toMatchObject({ phase: "active", round: 0 });
  });

  test("with no round left, the goal is blocked and the bot is told once", async () => {
    const { bot, driver, woken } = await setup({ maxRounds: 1 });

    await driver.advance(alice, bot.id);
    await driver.advance(alice, bot.id);
    await driver.advance(alice, bot.id);

    expect(woken).toHaveLength(2);
    expect(woken[1]!.note).toContain("Your goal stopped: It reached its 1-round limit.");
    expect(await goalsService.get(bot.id)).toMatchObject({
      phase: "blocked",
      blockedReason: "It reached its 1-round limit.",
    });
  });

  test("a goal that is not active gets no round", async () => {
    const { bot, driver, woken } = await setup();
    await goalsService.update(bot.id, "pause");

    await driver.advance(alice, bot.id);

    expect(woken).toEqual([]);
    expect((await goalsService.get(bot.id))?.round).toBe(0);
  });

  test("a reply that settles well starts the next round", async () => {
    const { bot, driver, woken } = await setup();

    await driver.settled({ userId: alice, botId: bot.id, prompt: "hello", ok: true });
    await driver.settled({
      userId: alice,
      botId: bot.id,
      prompt: botNote("Goal round 1 of 20. …"),
      ok: true,
    });

    expect(woken.map((each) => each.note.slice(0, 12))).toEqual(["Goal round 1", "Goal round 2"]);
    expect(woken[0]!.note).toContain("Port the parser");
    expect(woken[1]!.note).not.toContain("Port the parser");
    expect(woken[1]!.note).toContain("get_goal");
  });

  test("a round that failed blocks the goal and tells the bot; another reply that failed does not", async () => {
    const { bot, driver, woken } = await setup();

    await driver.settled({ userId: alice, botId: bot.id, prompt: "hello", ok: false });
    await driver.settled({
      userId: alice,
      botId: bot.id,
      prompt: botNote("Scheduled task is due"),
      ok: false,
    });
    expect(woken).toEqual([]);
    expect((await goalsService.get(bot.id))?.phase).toBe("active");

    await driver.settled({
      userId: alice,
      botId: bot.id,
      prompt: botNote("Goal round 3 of 20. …"),
      ok: false,
    });

    expect(await goalsService.get(bot.id)).toMatchObject({
      phase: "blocked",
      blockedReason: "A round failed.",
    });
    expect(woken).toHaveLength(1);
    expect(woken[0]!.note).toContain("Your goal stopped: A round failed.");
  });

  test("the tick starts a round for a goal whose bot is idle, and leaves one that is at work", async () => {
    const { bot, driver, woken, state } = await setup();
    state.idle = false;
    await driver.tick();
    expect(woken.filter((each) => each.botId === bot.id)).toEqual([]);

    state.idle = true;
    await driver.tick();

    expect(woken.filter((each) => each.botId === bot.id)).toHaveLength(1);
  });

  test("a bot that cannot be told its goal stopped leaves the goal stopped all the same", async () => {
    const { bot, driver, state } = await setup({ maxRounds: 1 });
    await driver.advance(alice, bot.id);
    state.refuse = true;

    await driver.advance(alice, bot.id);

    expect(await goalsService.get(bot.id)).toMatchObject({ phase: "blocked" });
  });

  test("closing waits for a tick and stops the timer", async () => {
    const { driver } = await setup();
    driver.start();
    await driver.close();
    await driver.close();
  });

  test("a tick that cannot wake a bot leaves the goal for the next", async () => {
    const { bot, driver, state } = await setup();
    state.refuse = true;
    await driver.tick();
    expect(await goalsService.get(bot.id)).toMatchObject({ phase: "active", round: 0 });
  });
});
