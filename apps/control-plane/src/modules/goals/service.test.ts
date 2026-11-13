import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("goalsService (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { inArray } = await import("drizzle-orm");
  const { GOAL_DEFAULT_ROUNDS, GOAL_MAX_ROUNDS } = await import("@aven/protocol/goals");
  const { UnprocessableError } = await import("@aven/server-kit/errors");
  const { botsService } = await import("../bots/service");
  const { goalsService } = await import("./service");

  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `u-goal-a-${suffix}`;
  const bob = `u-goal-b-${suffix}`;

  beforeAll(async () => {
    await db.insert(users).values([
      { id: alice, name: "Alice", email: `${alice}@aven.test` },
      { id: bob, name: "Bob", email: `${bob}@aven.test` },
    ]);
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [alice, bob]));
  });

  const botFor = async (userId: string) =>
    (
      await botsService.create(userId, {
        name: `Bot ${crypto.randomUUID().slice(0, 4)}`,
        instruction: "x",
      })
    ).id;
  const input = { objective: "Port the parser", checks: ["bun test"] };

  test("a goal starts active with the default rounds, and is read back as the bot sees it", async () => {
    const id = await botFor(alice);
    expect(await goalsService.get(id)).toBeNull();

    const started = await goalsService.start(alice, id, input);

    expect(started).toEqual({
      objective: "Port the parser",
      checks: ["bun test"],
      phase: "active",
      blockedReason: null,
      round: 0,
      maxRounds: GOAL_DEFAULT_ROUNDS,
    });
    expect(await goalsService.get(id)).toEqual(started);
  });

  test("the rounds asked for are held to the most there may be", async () => {
    const id = await botFor(alice);
    expect((await goalsService.start(alice, id, { ...input, maxRounds: 7 })).maxRounds).toBe(7);
    await goalsService.update(id, "clear");
    expect((await goalsService.start(alice, id, { ...input, maxRounds: 10_000 })).maxRounds).toBe(
      GOAL_MAX_ROUNDS,
    );
  });

  test("a bot has one goal at a time: an unfinished one is not replaced, a finished or cleared one is", async () => {
    const id = await botFor(alice);
    await goalsService.start(alice, id, input);
    await expect(goalsService.start(alice, id, input)).rejects.toThrow("already have a goal");
    await goalsService.update(id, "pause");
    await expect(goalsService.start(alice, id, input)).rejects.toBeInstanceOf(UnprocessableError);
    await goalsService.update(id, "blocked", "needs a key");
    await expect(goalsService.start(alice, id, input)).rejects.toThrow("already have a goal");

    await goalsService.update(id, "complete");
    const next = await goalsService.start(alice, id, { ...input, objective: "Second" });
    expect(next).toMatchObject({ objective: "Second", phase: "active", round: 0 });

    await goalsService.update(id, "clear");
    expect(await goalsService.get(id)).toBeNull();
    expect(await goalsService.start(alice, id, input)).toMatchObject({ phase: "active" });
  });

  test("two goals started at once leave one", async () => {
    const id = await botFor(alice);
    const results = await Promise.allSettled([
      goalsService.start(alice, id, { ...input, objective: "A" }),
      goalsService.start(alice, id, { ...input, objective: "B" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  test("each action is taken only from where it makes sense, and a block says why", async () => {
    const id = await botFor(alice);
    await expect(goalsService.update(id, "pause")).rejects.toThrow("You have no goal");
    await goalsService.start(alice, id, input);

    await expect(goalsService.update(id, "resume")).rejects.toThrow(
      "is active, so you cannot resume",
    );
    await expect(goalsService.update(id, "blocked", "  ")).rejects.toThrow("Say what is blocking");
    expect(await goalsService.update(id, "pause")).toMatchObject({ phase: "paused" });
    await expect(goalsService.update(id, "pause")).rejects.toThrow("so you cannot pause");
    expect(await goalsService.update(id, "resume")).toMatchObject({
      phase: "active",
      blockedReason: null,
    });
    expect(await goalsService.update(id, "blocked", " no key ")).toMatchObject({
      phase: "blocked",
      blockedReason: "no key",
    });
    expect(await goalsService.update(id, "resume")).toMatchObject({ phase: "active" });
    expect(await goalsService.update(id, "complete")).toMatchObject({ phase: "complete" });
    expect(await goalsService.update(id, "complete")).toMatchObject({ phase: "complete" });
    await expect(goalsService.update(id, "pause")).rejects.toThrow("so you cannot pause");
    expect(await goalsService.update(id, "clear")).toBeNull();
    await expect(goalsService.update(id, "clear")).rejects.toThrow("You have no goal");
  });

  test("resuming a goal that ran out of rounds gives it more", async () => {
    const id = await botFor(alice);
    await goalsService.start(alice, id, { ...input, maxRounds: 2 });
    await goalsService.claimRound(id);
    await goalsService.claimRound(id);
    expect(await goalsService.claimRound(id)).toBeNull();
    await goalsService.block(id, "It reached its 2-round limit.");

    const resumed = await goalsService.update(id, "resume");

    expect(resumed).toMatchObject({
      phase: "active",
      round: 2,
      maxRounds: 2 + GOAL_DEFAULT_ROUNDS,
    });
    expect(await goalsService.claimRound(id)).toMatchObject({ roundsStarted: 3 });
  });

  test("resuming a goal that stopped with rounds left keeps its cap, and one at the most there may be gets more", async () => {
    const id = await botFor(alice);
    await goalsService.start(alice, id, { ...input, maxRounds: 5 });
    await goalsService.claimRound(id);
    await goalsService.update(id, "pause");
    expect(await goalsService.update(id, "resume")).toMatchObject({ round: 1, maxRounds: 5 });

    await goalsService.update(id, "clear");
    await goalsService.start(alice, id, { ...input, maxRounds: GOAL_MAX_ROUNDS });
    for (let round = 0; round < GOAL_MAX_ROUNDS; round++) await goalsService.claimRound(id);
    await goalsService.block(id, "It reached its limit.");
    expect(await goalsService.update(id, "resume")).toMatchObject({
      round: GOAL_MAX_ROUNDS,
      maxRounds: GOAL_MAX_ROUNDS,
    });

    await goalsService.update(id, "pause");
    expect(await goalsService.update(id, "resume")).toMatchObject({
      round: GOAL_MAX_ROUNDS,
      maxRounds: GOAL_MAX_ROUNDS,
    });
  });

  test("resuming a goal that used its rounds gives it the usual extension, never past the most a goal may have", async () => {
    const id = await botFor(alice);
    await goalsService.start(alice, id, { ...input, maxRounds: 10 });
    for (let round = 0; round < 10; round++) await goalsService.claimRound(id);
    await goalsService.block(id, "Out of rounds.");
    expect(await goalsService.update(id, "resume")).toMatchObject({
      round: 10,
      maxRounds: 10 + GOAL_DEFAULT_ROUNDS,
    });

    await goalsService.update(id, "clear");
    await goalsService.start(alice, id, { ...input, maxRounds: GOAL_MAX_ROUNDS - 5 });
    for (let round = 0; round < GOAL_MAX_ROUNDS - 5; round++) await goalsService.claimRound(id);
    await goalsService.block(id, "Out of rounds.");
    expect(await goalsService.update(id, "resume")).toMatchObject({
      round: GOAL_MAX_ROUNDS - 5,
      maxRounds: GOAL_MAX_ROUNDS,
    });
  });

  test("a round is counted when it is claimed, only while the goal is active, and not when released", async () => {
    const id = await botFor(alice);
    expect(await goalsService.claimRound(id)).toBeNull();
    await goalsService.start(alice, id, { ...input, maxRounds: 3 });

    expect(await goalsService.claimRound(id)).toMatchObject({ roundsStarted: 1 });
    await goalsService.releaseRound(id);
    expect((await goalsService.get(id))?.round).toBe(0);
    await goalsService.releaseRound(id);
    expect((await goalsService.get(id))?.round).toBe(0);

    await goalsService.update(id, "pause");
    expect(await goalsService.claimRound(id)).toBeNull();
  });

  test("a goal is blocked only while active, and active goals are listed with their person", async () => {
    const id = await botFor(bob);
    await goalsService.start(bob, id, input);
    expect(await goalsService.activeBots()).toContainEqual({ userId: bob, botId: id });

    expect(await goalsService.block(id, "failed")).toBe(true);
    expect(await goalsService.block(id, "again")).toBe(false);
    expect(await goalsService.get(id)).toMatchObject({ phase: "blocked", blockedReason: "failed" });
    expect((await goalsService.activeBots()).map((each) => each.botId)).not.toContain(id);
  });
});
