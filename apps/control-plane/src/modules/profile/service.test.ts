import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const DAY = 86_400_000;

const dayAgo = (days: number) => new Date(Date.now() - days * DAY);

run("profileService (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { agentMemoryMessages, agentMemorySessions } = await import("@aven/db/schema/anvia-memory");
  const { threads } = await import("@aven/db/schema/threads");
  const { eq, inArray } = await import("drizzle-orm");
  const { seedProject } = await import("../../testing/seed-project");
  const { signUp } = await import("../../testing/sign-up");
  const { runtimesService } = await import("../runtimes/service");
  const { profileService } = await import("./service");

  let person: Awaited<ReturnType<typeof signUp>>;
  let other: Awaited<ReturnType<typeof signUp>>;
  let threadId: string;
  const sessionIds: string[] = [];

  const message = (tokens: number) => ({
    role: "assistant" as const,
    content: "done",
    metadata: {
      anvia: {
        generation: {
          provider: "anthropic",
          modelId: "claude-sonnet-4",
          usage: {
            inputTokens: tokens - 4,
            outputTokens: 4,
            totalTokens: tokens,
            cachedInputTokens: 0,
            cacheCreationInputTokens: 0,
          },
        },
      },
    },
  });

  beforeAll(async () => {
    person = await signUp("profile-person");
    other = await signUp("profile-other");
    const runtime = (
      await runtimesService.create(person.organizationId, person.userId, { name: "r" })
    ).runtime;
    const { project } = await seedProject(person.organizationId, person.userId, runtime.id);
    const [thread] = await db
      .insert(threads)
      .values({
        organizationId: person.organizationId,
        projectId: project.id,
        createdBy: person.userId,
        runtimeId: runtime.id,
        title: "Mine",
      })
      .returning();
    threadId = thread!.id;

    const [session] = await db
      .insert(agentMemorySessions)
      .values({ scopeKey: `profile-${threadId}`, sessionId: threadId })
      .returning();
    sessionIds.push(session!.id);
    await db.insert(agentMemoryMessages).values(
      [0, 1, 2, 9].map((daysAgo, position) => ({
        memorySessionId: session!.id,
        runId: "run",
        turn: 0,
        position,
        role: "assistant" as const,
        message: message(daysAgo === 9 ? 4_000 : 1_000),
        createdAt: dayAgo(daysAgo),
      })),
    );

    const [stranger] = await db
      .insert(agentMemorySessions)
      .values({
        scopeKey: `profile-stranger-${crypto.randomUUID()}`,
        sessionId: crypto.randomUUID(),
      })
      .returning();
    sessionIds.push(stranger!.id);
    await db.insert(agentMemoryMessages).values({
      memorySessionId: stranger!.id,
      runId: "run",
      turn: 0,
      position: 0,
      role: "assistant" as const,
      message: message(9_000_000),
      createdAt: dayAgo(0),
    });
  });

  afterAll(async () => {
    await db
      .delete(agentMemoryMessages)
      .where(inArray(agentMemoryMessages.memorySessionId, sessionIds));
    await db.delete(agentMemorySessions).where(inArray(agentMemorySessions.id, sessionIds));
    await db.delete(threads).where(eq(threads.id, threadId));
    await person?.remove();
    await other?.remove();
  });

  test("a person's activity is their own: the threads they began, with the tokens of each day", async () => {
    const stats = await profileService.stats(person.userId);

    expect(stats.threads).toBe(1);
    expect(stats.tokens).toBe(7_000);
    expect(stats.days.map((day) => day.date).sort()).toEqual(
      [0, 1, 2, 9].map((daysAgo) => dayAgo(daysAgo).toISOString().slice(0, 10)).sort(),
    );
    expect(stats.currentStreakDays).toBe(3);
    expect(stats.longestStreakDays).toBe(3);
  });

  test("people with no activity of their own see nothing", async () => {
    const stats = await profileService.stats(other.userId);
    expect(stats).toMatchObject({ threads: 0, tokens: 0, currentStreakDays: 0, days: [] });
  });
});
