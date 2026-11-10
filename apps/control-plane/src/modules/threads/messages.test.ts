import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { threads } from "@aven/db/schema/threads";
import { users } from "@aven/db/schema/users";
import { githubUserTokens } from "@aven/db/schema/github-user-tokens";
import { eq } from "drizzle-orm";

import { encryptSecret } from "../../crypto";

import { decisionModelService } from "../decision-model/service";
import { providersService } from "../providers/service";
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
  await decisionModelService.save(orgA, { kind: "jev", apiKey: "test-key-0000" });
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

  const started: { prompt: string; model: unknown; extras: Record<string, unknown> }[] = [];
  const steered: string[] = [];
  const steeredBy: (string | undefined)[] = [];
  const answered: Record<string, unknown>[] = [];
  const messages = (running: boolean) =>
    createThreadMessages(
      {
        isRunning: () => running,
        start: async (_thread: unknown, prompt: string, model: unknown, extras: object) => {
          started.push({ prompt, model, extras: extras as Record<string, unknown> });
        },
        steer: async (_thread: unknown, message: { prompt: string; senderId?: string }) => {
          steered.push(message.prompt);
          steeredBy.push(message.senderId);
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
        latest: async () => ({ messages: [], hidden: 0 }),
      } as never,
      async () => ({ agentAction: true, by: "model" }),
    );

  const driven = async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    await threadsService.update(owner, thread.id, { visibility: "workspace", driving: 7 });
    return thread;
  };
  const mate = { organizationId: orgA, userId: mateId };
  const idOf = (extras: Record<string, unknown>) =>
    (extras.identity as { userId: string; driverId?: string }) ?? undefined;

  const connectGithub = (id: string, login: string, githubUserId: number) =>
    db.insert(githubUserTokens).values({
      userId: id,
      githubUserId,
      login,
      name: login,
      accessTokenEncrypted: encryptSecret(`ghu_${login}`),
    });
  const githubOf = (extras: Record<string, unknown>) =>
    extras.github as { token: string; login: string } | undefined;

  test("a teammate's run signs in to GitHub as the teammate, never as the creator", async () => {
    const thread = await driven();
    await connectGithub(userId, "creator", 1);
    started.length = 0;
    await messages(false).send(orgA, mateId, thread.id, { prompt: "one" });
    expect(githubOf(started[0]!.extras)).toBeUndefined();

    await connectGithub(mateId, "mate", 2);
    await messages(false).send(orgA, mateId, thread.id, { prompt: "two" });
    expect(githubOf(started[1]!.extras)).toMatchObject({ token: "ghu_mate", login: "mate" });

    await messages(false).send(orgA, userId, thread.id, { prompt: "three" });
    expect(githubOf(started[2]!.extras)).toMatchObject({ token: "ghu_creator", login: "creator" });
  });

  test("a teammate's run uses the teammate's own provider and the creator's stays the creator's", async () => {
    const thread = await driven();
    await providersService.create(userId, {
      kind: "anthropic",
      name: "Creator",
      apiKey: "sk-creator-0000",
    });
    await providersService.create(mateId, { kind: "openai", name: "Mate", apiKey: "sk-mate-0000" });
    started.length = 0;
    await messages(false).send(orgA, mateId, thread.id, { prompt: "one" });
    await messages(false).send(orgA, userId, thread.id, { prompt: "two" });
    expect(started[0]?.model).toMatchObject({ provider: "openai", apiKey: "sk-mate-0000" });
    expect(started[1]?.model).toMatchObject({ provider: "anthropic", apiKey: "sk-creator-0000" });
  });

  test("a teammate's message starts a run as the creator, marked with the teammate's name", async () => {
    const thread = await driven();
    started.length = 0;
    await messages(false).send(orgA, mateId, thread.id, { prompt: "try the other way" });
    expect(started).toHaveLength(1);
    expect(started[0]?.prompt).toBe("[driver: Ana Lima] try the other way");
    expect(started[0]?.extras.senderId).toBe(mateId);
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
    expect(started[0]?.extras.senderId).toBe(userId);
  });

  test("a teammate's message steers a working agent, marked the same way", async () => {
    const thread = await driven();
    steered.length = 0;
    steeredBy.length = 0;
    const sent = await messages(true).send(orgA, mateId, thread.id, { prompt: "also this" });
    expect(sent.steered).toBe(true);
    expect(steered).toEqual(["[driver: Ana Lima] also this"]);
    expect(steeredBy).toEqual([mateId]);
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

run("a mention in a multiplayer thread (postgres, decision 0191)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const runner = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const { project } = await seedProject(orgA, userId, runner.id, "proj");
  await decisionModelService.save(orgA, { kind: "jev", apiKey: "test-key-0000" });
  const owner = { organizationId: orgA, userId };
  afterAll(cleanup);

  const started: string[] = [];
  const kept: string[] = [];
  const keptBy: string[] = [];
  const asked: string[] = [];
  const steered: string[] = [];
  const messages = (agentAction: boolean, running = false) =>
    createThreadMessages(
      {
        isRunning: () => running,
        steer: async (_thread: unknown, message: { prompt: string }) => {
          steered.push(message.prompt);
          return "queued";
        },
        start: async (_thread: unknown, prompt: string) => {
          started.push(prompt);
        },
        note: async (_thread: unknown, prompt: string, senderId?: string) => {
          kept.push(prompt);
          keptBy.push(senderId ?? "");
        },
        latest: async () => ({ messages: [], hidden: 0 }),
      } as never,
      async ({ prompt }) => {
        asked.push(prompt);
        return { agentAction, by: "model" };
      },
    );
  const thread = async (driving: number | null) => {
    const created = await threadsService.create(orgA, userId, { projectId: project.id });
    await threadsService.update(owner, created.id, { visibility: "workspace", driving });
    return created;
  };
  const toRandy = "@[Randy](user:u-2) did you deploy the fix?";

  test("a message the gate says is for a person is kept without starting a run", async () => {
    const driven = await thread(7);
    started.length = 0;
    kept.length = 0;
    const sent = await messages(false).send(orgA, userId, driven.id, { prompt: toRandy });
    expect(sent).toEqual({ steered: false, agentAction: false });
    expect(kept).toEqual([`​${toRandy}`.replace("​", "")]);
    expect(started).toEqual([]);
  });

  test("a message the gate says is for the agent starts a run", async () => {
    const driven = await thread(7);
    started.length = 0;
    kept.length = 0;
    const sent = await messages(true).send(orgA, userId, driven.id, { prompt: toRandy });
    expect(sent.steered).toBe(false);
    expect(started).toHaveLength(1);
    expect(kept).toEqual([]);
  });

  test("a message sent while the agent is working steers it as before, and the gate is not asked", async () => {
    const driven = await thread(7);
    steered.length = 0;
    asked.length = 0;
    const sent = await messages(false, true).send(orgA, userId, driven.id, { prompt: toRandy });
    expect(sent).toEqual({ steered: true });
    expect(steered).toEqual([toRandy]);
    expect(asked).toEqual([]);
  });

  test("a message with no mention is asked of the gate too while multiplayer is on", async () => {
    const driven = await thread(7);
    asked.length = 0;
    started.length = 0;
    await messages(true).send(orgA, userId, driven.id, { prompt: "fix the build" });
    expect(asked).toEqual(["fix the build"]);
    expect(started).toHaveLength(1);
  });

  test("the gate is not asked outside multiplayer or with files", async () => {
    const plain = await thread(null);
    const driven = await thread(7);
    started.length = 0;
    asked.length = 0;
    await messages(false).send(orgA, userId, plain.id, { prompt: toRandy });
    await messages(false).send(orgA, userId, driven.id, {
      prompt: toRandy,
      attachments: [{ name: "a.txt", mediaType: "text/plain", data: "aGk=" }],
    });
    expect(started).toHaveLength(2);
    expect(asked).toEqual([]);
  });
});
