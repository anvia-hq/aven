import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { users } from "@aven/db/schema/users";
import type { ChatMessage } from "@aven/protocol/events";
import { eq } from "drizzle-orm";

import { runtimesService } from "../runtimes/service";
import { createBotThreads } from "./bot-access";
import { threadsService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a bot's threads (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const runnerA = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const runnerB = (await runtimesService.create(orgB, userId, { name: "b" })).runtime;
  const { project: projectA } = await seedProject(orgA, userId, runnerA.id, "app-a");
  const { project: projectB } = await seedProject(orgB, userId, runnerB.id, "app-b");
  // The person belongs to workspace A only; B is a workspace they are not a member of.
  await db
    .insert(members)
    .values({ id: `m-${userId}`, organizationId: orgA, userId, role: "owner" });

  const mateId = `${userId}-mate`;
  await db.insert(users).values({ id: mateId, name: "Mate", email: `${mateId}@aven.test` });
  await db
    .insert(members)
    .values({ id: `m-${mateId}`, organizationId: orgA, userId: mateId, role: "member" });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, mateId));
    await cleanup();
  });

  const transcript: ChatMessage[] = [
    { id: "1", role: "user", parts: [{ type: "text", text: "Fix the build" }] },
    {
      id: "2",
      role: "assistant",
      parts: [
        { type: "text", text: "On it." },
        {
          type: "tool",
          tool: {
            id: "t",
            name: "exec_command",
            target: "bun test",
            status: "done",
            output: "SECRET",
          },
        },
      ],
    },
  ];
  const sent: { org: string; userId: string; thread: string; body: unknown }[] = [];
  let failSend: Error | undefined;
  let running = new Set<string>();
  const botId = crypto.randomUUID();
  const watched: string[] = [];
  const bot = createBotThreads({
    runs: { isRunning: (id) => running.has(id), history: async () => transcript },
    watch: {
      watch: async (thread, watcher) => void watched.push(`watch ${thread} ${watcher.botId}`),
      settle: async (thread) => void watched.push(`settle ${thread}`),
    },
    messages: {
      send: async (org, user, thread, body) => {
        if (failSend) throw failSend;
        sent.push({ org, userId: user, thread, body });
        running.add(thread);
        return { steered: false };
      },
    },
  });

  test("lists the projects of the workspaces the person belongs to, and not another's", async () => {
    const found = await bot.projects(userId);
    expect(found.map((project) => project.id)).toContain(projectA.id);
    expect(found.map((project) => project.id)).not.toContain(projectB.id);
    expect(found.find((project) => project.id === projectA.id)).toMatchObject({
      name: "app-a",
      repository: expect.stringContaining("/"),
    });
  });

  test("starting makes a thread in the project's workspace, titled from the prompt, and sends it the prompt as the person", async () => {
    const started = await bot.start(userId, botId, {
      projectId: projectA.id,
      prompt: "Fix the build\nand then the lint",
      modelId: "gpt-5",
    });
    expect(started).toMatchObject({
      title: "Fix the build and then the lint",
      projectId: projectA.id,
      state: "open",
      mine: true,
      running: true,
    });
    expect(sent.at(-1)).toEqual({
      org: orgA,
      userId,
      thread: started.id,
      body: { prompt: "Fix the build\nand then the lint", modelId: "gpt-5" },
    });
    const row = await threadsService.readableForPerson(userId, started.id);
    expect(row.organizationId).toBe(orgA);
    expect(row.createdBy).toBe(userId);
  });

  test("a project of another workspace, or one that is not there, is not found, and nothing is made", async () => {
    const before = (await bot.list(userId, {})).length;
    for (const projectId of [projectB.id, crypto.randomUUID()]) {
      await expect(bot.start(userId, botId, { projectId, prompt: "x" })).rejects.toThrow(
        "There is no project with that id",
      );
    }
    expect((await bot.list(userId, {})).length).toBe(before);
  });

  test("a thread that could not be started is put away and the reason is given", async () => {
    failSend = new Error("The runner is offline");
    try {
      await expect(
        bot.start(userId, botId, { projectId: projectA.id, prompt: "Doomed" }),
      ).rejects.toThrow("The runner is offline");
    } finally {
      failSend = undefined;
    }
    expect((await bot.list(userId, {})).map((thread) => thread.title)).not.toContain("Doomed");
    expect((await bot.list(userId, { archived: true })).map((thread) => thread.title)).toContain(
      "Doomed",
    );
  });

  test("lists the open threads, narrowed to a project, and the archived ones apart", async () => {
    const one = await bot.start(userId, botId, { projectId: projectA.id, prompt: "List me" });
    const open = await bot.list(userId, { projectId: projectA.id });
    expect(open.map((thread) => thread.id)).toContain(one.id);
    expect(open.every((thread) => thread.state !== "archived")).toBe(true);
    expect(await bot.list(userId, { projectId: crypto.randomUUID() })).toEqual([]);
    await bot.archive(userId, one.id, true);
    expect((await bot.list(userId, {})).map((thread) => thread.id)).not.toContain(one.id);
    expect((await bot.list(userId, { archived: true })).map((thread) => thread.id)).toContain(
      one.id,
    );
  });

  test("looking at a thread gives its latest turns, with what the agent called and none of what it returned", async () => {
    const one = await bot.start(userId, botId, { projectId: projectA.id, prompt: "Look at me" });
    const seen = await bot.get(userId, one.id);
    expect(seen.turns).toEqual([
      { role: "user", text: "Fix the build", tools: undefined },
      { role: "assistant", text: "On it.", tools: ["exec_command bun test (done)"] },
    ]);
    expect(seen.earlier).toBe(0);
    expect(JSON.stringify(seen)).not.toContain("SECRET");
  });

  test("continuing sends the message to the person's own thread, and not while it works or waits for an answer", async () => {
    const one = await bot.start(userId, botId, { projectId: projectA.id, prompt: "Continue me" });
    // A run is going on.
    await expect(bot.continue(userId, botId, one.id, { prompt: "More" })).rejects.toThrow(
      "still going on",
    );
    running = new Set();
    await bot.continue(userId, botId, one.id, { prompt: "More", reasoningEffort: "high" });
    expect(sent.at(-1)).toEqual({
      org: orgA,
      userId,
      thread: one.id,
      body: { prompt: "More", reasoningEffort: "high" },
    });
    // The agent asked a question.
    running = new Set();
    await threadsService.saveContinuation(one.id, { waiting: true });
    await expect(bot.continue(userId, botId, one.id, { prompt: "Again" })).rejects.toThrow(
      "waits for the answer",
    );
    expect((await bot.get(userId, one.id)).awaitingAnswer).toBe(true);
  });

  test("a thread that a teammate shared can be read and not driven, and a private one is not found", async () => {
    const theirs = await threadsService.create(orgA, mateId, {
      projectId: projectA.id,
      title: "Theirs",
    });
    await expect(bot.get(userId, theirs.id)).rejects.toThrow("Thread not found");
    expect((await bot.list(userId, {})).map((thread) => thread.id)).not.toContain(theirs.id);

    await threadsService.update({ organizationId: orgA, userId: mateId }, theirs.id, {
      visibility: "workspace",
    });
    const seen = await bot.get(userId, theirs.id);
    expect(seen).toMatchObject({ title: "Theirs", mine: false, createdBy: "Mate" });
    expect((await bot.list(userId, {})).find((thread) => thread.id === theirs.id)?.mine).toBe(
      false,
    );

    await expect(bot.continue(userId, botId, theirs.id, { prompt: "Hi" })).rejects.toThrow(
      "Thread not found",
    );
    await expect(bot.archive(userId, theirs.id, true)).rejects.toThrow("Thread not found");
    expect((await threadsService.readableForPerson(mateId, theirs.id)).state).toBe("open");
  });

  test("a thread of a workspace the person is not in is not found, whoever made it", async () => {
    const elsewhere = await threadsService.create(orgB, userId, {
      projectId: projectB.id,
      title: "Elsewhere",
    });
    await expect(bot.get(userId, elsewhere.id)).rejects.toThrow("Thread not found");
    await expect(bot.continue(userId, botId, elsewhere.id, { prompt: "Hi" })).rejects.toThrow(
      "Thread not found",
    );
    await expect(bot.archive(userId, elsewhere.id, true)).rejects.toThrow("Thread not found");
    expect((await bot.list(userId, {})).map((thread) => thread.id)).not.toContain(elsewhere.id);
  });

  test("a thread the bot starts or continues is watched for it, and one it archives is settled", async () => {
    running = new Set();
    const one = await bot.start(userId, botId, { projectId: projectA.id, prompt: "Watch me" });
    running = new Set();
    await bot.continue(userId, botId, one.id, { prompt: "And more" });
    await bot.archive(userId, one.id, true);
    await bot.archive(userId, one.id, false);
    expect(watched.filter((line) => line.includes(one.id))).toEqual([
      `watch ${one.id} ${botId}`,
      `watch ${one.id} ${botId}`,
      `settle ${one.id}`,
    ]);
  });

  test("a thread that could not be started is not watched", async () => {
    const before = watched.length;
    failSend = new Error("The runner is offline");
    try {
      await expect(
        bot.start(userId, botId, { projectId: projectA.id, prompt: "Unwatched" }),
      ).rejects.toThrow("The runner is offline");
    } finally {
      failSend = undefined;
    }
    expect(watched.length).toBe(before);
  });

  test("archiving puts the thread away, and false brings it back, leaving it open", async () => {
    const one = await bot.start(userId, botId, { projectId: projectA.id, prompt: "Archive me" });
    expect((await bot.archive(userId, one.id, true)).state).toBe("archived");
    expect((await bot.archive(userId, one.id, false)).state).toBe("open");
  });
});
