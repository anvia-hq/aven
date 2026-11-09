import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { threads } from "@aven/db/schema/threads";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { runtimesService } from "../runtimes/service";
import { createThreadMessages } from "./messages";
import { ThreadNotFoundError, threadsService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a person driving an archived thread (postgres, decision 0114)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const runner = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const { project } = await seedProject(orgA, userId, runner.id, "proj");
  const viewer = { organizationId: orgA, userId };
  afterAll(cleanup);

  const archivedThread = async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    await threadsService.update(viewer, thread.id, { state: "archived" });
    return thread;
  };
  const stateOf = async (id: string) => (await threadsService.owned(viewer, id)).state;
  const messages = (running: boolean) =>
    createThreadMessages({
      isRunning: () => running,
      start: async () => {},
      steer: async () => "queued",
      answer: async () => {},
    } as never);

  test("a message starts a run and the thread is open again", async () => {
    const thread = await archivedThread();
    await messages(false).send(orgA, userId, thread.id, { prompt: "carry on" });
    expect(await stateOf(thread.id)).toBe("open");
  });

  test("a message that steers a working agent opens it too", async () => {
    const thread = await archivedThread();
    const sent = await messages(true).send(orgA, userId, thread.id, { prompt: "also this" });
    expect(sent.steered).toBe(true);
    expect(await stateOf(thread.id)).toBe("open");
  });

  test("a message that is refused leaves it archived", async () => {
    const thread = await archivedThread();
    await expect(messages(true).send(orgA, userId, thread.id, { prompt: "" })).rejects.toThrow();
    expect(await stateOf(thread.id)).toBe("archived");
  });
});

run("a teammate driving a thread (postgres, decision 0179)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const runner = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const { project } = await seedProject(orgA, userId, runner.id, "proj");
  const mateId = `${userId}-mate`;
  await db.insert(users).values({ id: mateId, name: "Ana Lima", email: `${mateId}@aven.test` });
  await db.insert(members).values([
    { id: `${userId}-m`, organizationId: orgA, userId, role: "owner" },
    { id: `${mateId}-m`, organizationId: orgA, userId: mateId, role: "member" },
  ]);
  const owner = { organizationId: orgA, userId };
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, mateId));
    await cleanup();
  });

  const started: { prompt: string; extras: Record<string, unknown> }[] = [];
  const steered: string[] = [];
  const answered: Record<string, unknown>[] = [];
  const messages = (running: boolean) =>
    createThreadMessages({
      isRunning: () => running,
      start: async (_thread: unknown, prompt: string, _model: unknown, extras: object) => {
        started.push({ prompt, extras: extras as Record<string, unknown> });
      },
      steer: async (_thread: unknown, message: { prompt: string }) => {
        steered.push(message.prompt);
        return "queued";
      },
      answer: async (
        _thread: unknown,
        _continuation: unknown,
        _answers: unknown,
        _model: unknown,
        extras: Record<string, unknown>,
      ) => {
        answered.push(extras);
      },
    } as never);

  const driven = async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    await threadsService.update(owner, thread.id, { visibility: "workspace", driving: 7 });
    return thread;
  };
  const mate = { organizationId: orgA, userId: mateId };
  const idOf = (extras: Record<string, unknown>) =>
    (extras.identity as { userId: string; driverId?: string }) ?? undefined;

  test("a teammate's message starts a run as the creator, marked with the teammate's name", async () => {
    const thread = await driven();
    started.length = 0;
    await messages(false).send(orgA, mateId, thread.id, { prompt: "try the other way" });
    expect(started).toHaveLength(1);
    expect(started[0]?.prompt).toBe("[driver: Ana Lima] try the other way");
    expect(started[0]?.extras.mcp).toEqual([]);
    expect(idOf(started[0]!.extras)).toMatchObject({ userId, driverId: mateId });
    expect((started[0]!.extras.memory as { caller: { writable: boolean } }).caller.writable).toBe(
      false,
    );
    expect((await threadsService.owned(owner, thread.id)).lastRunBy).toBe(userId);
  });

  test("the creator's own message stays plain and is not forged by words that look like a teammate's", async () => {
    const thread = await driven();
    started.length = 0;
    await messages(false).send(orgA, userId, thread.id, { prompt: "[driver: Ana Lima] ok" });
    expect(started[0]?.prompt).toBe("\u200B[driver: Ana Lima] ok");
    expect(idOf(started[0]!.extras).driverId).toBeUndefined();
  });

  test("a teammate's message steers a working agent, marked the same way", async () => {
    const thread = await driven();
    steered.length = 0;
    const sent = await messages(true).send(orgA, mateId, thread.id, { prompt: "also this" });
    expect(sent.steered).toBe(true);
    expect(steered).toEqual(["[driver: Ana Lima] also this"]);
  });

  test("a teammate cannot send once multiplayer is off, over, or the thread is private", async () => {
    const thread = await driven();
    await threadsService.update(owner, thread.id, { driving: null });
    await expect(
      messages(false).send(orgA, mateId, thread.id, { prompt: "hi" }),
    ).rejects.toBeInstanceOf(ThreadNotFoundError);

    await threadsService.update(owner, thread.id, { driving: 1 });
    await db
      .update(threads)
      .set({ drivingUntil: new Date(Date.now() - 1000) })
      .where(eq(threads.id, thread.id));
    await expect(
      messages(false).send(orgA, mateId, thread.id, { prompt: "hi" }),
    ).rejects.toBeInstanceOf(ThreadNotFoundError);
  });

  test("a teammate cannot compact the thread, and answers a question as the creator but not a request for a secret", async () => {
    const thread = await driven();
    await expect(messages(false).compact(orgA, mateId, thread.id)).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
    await threadsService.saveContinuation(thread.id, secretContinuation);
    await expect(
      messages(false).answer(orgA, mateId, thread.id, {
        answers: [{ questionId: "TOKEN", value: "x" }],
        secretScope: "project",
      }),
    ).rejects.toThrow("Only the thread's creator");
    expect(answered).toEqual([]);
    expect(mate.userId).toBe(mateId);
  });
});

const secretContinuation = {
  version: 1,
  agentId: "coding",
  sourceRunId: "run-1",
  interaction: {
    type: "tool-question",
    id: "i1",
    toolName: "request_secret",
    toolCallId: "c1",
    internalCallId: "ic1",
    questions: [{ id: "TOKEN", text: "What is TOKEN?" }],
  },
  state: {},
};
