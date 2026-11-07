import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { users } from "@aven/db/schema/users";
import { eq, sql } from "drizzle-orm";

import { runtimesService } from "../runtimes/service";
import { createBotThreads } from "./bot-access";
import { threadsService } from "./service";
import type { ChatMessage } from "@aven/protocol/types";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a bot's threads (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const runnerA = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const runnerB = (await runtimesService.create(orgB, userId, { name: "b" })).runtime;
  const { project: projectA } = await seedProject(orgA, userId, runnerA.id, "app-a");
  const { project: projectB } = await seedProject(orgB, userId, runnerB.id, "app-b");
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
  const onWord: (boolean | undefined)[] = [];
  let failSend: Error | undefined;
  let sendStartsRun = true;
  let running = new Set<string>();
  const botId = crypto.randomUUID();
  const QUIET_AT = Date.parse("2026-11-03T10:00:00.000Z");
  const watched: string[] = [];
  const putAway: string[] = [];
  let followUp: "ok" | "unwatched" | "spent" = "ok";
  const person = { userId, botId, via: "person" } as const;
  const noted = { userId, botId, via: "note" } as const;
  const bot = createBotThreads({
    runs: {
      isRunning: (id) => running.has(id),
      history: async () => transcript,
      cancel: (id) => running.delete(id),
      activity: (id) => (running.has(id) ? { startedAt: 7, lastEventAt: QUIET_AT } : undefined),
    },
    watch: {
      watch: async (thread, watcher, { run, personsWord }) =>
        void watched.push(
          `watch ${thread} ${watcher.botId} run ${run}${personsWord ? "" : " follow-up"}`,
        ),
      settle: async (thread, by) => void watched.push(`settle ${thread} ${by}`),
      followUp: async (thread) => (watched.push(`follow-up ${thread}`), followUp),
      giveBack: async (thread) => void watched.push(`give back ${thread}`),
    },
    messages: {
      send: async (org, user, thread, body, options) => {
        if (failSend) throw failSend;
        sent.push({ org, userId: user, thread, body });
        onWord.push(options?.onPersonsWord);
        if (sendStartsRun) running.add(thread);
        return { steered: false };
      },
    },
    putAway: (thread) => void putAway.push(thread.id),
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
    const started = await bot.start(person, {
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
      await expect(bot.start(person, { projectId, prompt: "x" })).rejects.toThrow(
        "There is no project with that id",
      );
    }
    expect((await bot.list(userId, {})).length).toBe(before);
  });

  test("a thread that could not be started is put away and the reason is given", async () => {
    failSend = new Error("The runner is offline");
    try {
      await expect(bot.start(person, { projectId: projectA.id, prompt: "Doomed" })).rejects.toThrow(
        "The runner is offline",
      );
    } finally {
      failSend = undefined;
    }
    expect((await bot.list(userId, {})).map((thread) => thread.title)).not.toContain("Doomed");
    expect((await bot.list(userId, { archived: true })).map((thread) => thread.title)).toContain(
      "Doomed",
    );
  });

  test("archiving one puts it away: the run stops and the sandbox is freed, as when the person says so", async () => {
    const one = await bot.start(person, { projectId: projectA.id, prompt: "put me away" });
    running.add(one.id);
    putAway.length = 0;

    await bot.archive(person, one.id, true);

    expect(putAway).toEqual([one.id]);
    await bot.archive(person, one.id, false);
    expect(putAway).toEqual([one.id]);
  });

  test("lists the open threads, narrowed to a project, and the archived ones apart", async () => {
    const one = await bot.start(person, { projectId: projectA.id, prompt: "List me" });
    const open = await bot.list(userId, { projectId: projectA.id });
    expect(open.map((thread) => thread.id)).toContain(one.id);
    expect(open.every((thread) => thread.state !== "archived")).toBe(true);
    expect(await bot.list(userId, { projectId: crypto.randomUUID() })).toEqual([]);
    await bot.archive(person, one.id, true);
    expect((await bot.list(userId, {})).map((thread) => thread.id)).not.toContain(one.id);
    expect((await bot.list(userId, { archived: true })).map((thread) => thread.id)).toContain(
      one.id,
    );
  });

  test("open threads are found even when more than the listing's worth of newer archived threads come first", async () => {
    const open = await bot.start(person, { projectId: projectA.id, prompt: "Still open" });
    await db.execute(sql`
      insert into threads (organization_id, project_id, created_by, runtime_id, title, state, updated_at)
      select organization_id, project_id, created_by, runtime_id, 'Filler ' || g, 'archived', now() + interval '1 minute'
      from threads, generate_series(1, 520) as g
      where id = ${open.id}
    `);
    expect((await bot.list(userId, {})).map((thread) => thread.id)).toContain(open.id);
    expect(
      (await bot.list(userId, { projectId: projectA.id })).every(
        (thread) => thread.state !== "archived",
      ),
    ).toBe(true);
  });

  test("looking at a thread gives its latest turns, with what the agent called and none of what it returned", async () => {
    const one = await bot.start(person, { projectId: projectA.id, prompt: "Look at me" });
    const seen = await bot.get(userId, one.id);
    expect(seen.turns).toEqual([
      { role: "user", text: "Fix the build", tools: undefined },
      { role: "assistant", text: "On it.", tools: ["exec_command bun test (done)"] },
    ]);
    expect(seen.earlier).toBe(0);
    expect(JSON.stringify(seen)).not.toContain("SECRET");
  });

  test("continuing sends the message to the person's own thread, working or not, and not while it waits for an answer", async () => {
    const one = await bot.start(person, { projectId: projectA.id, prompt: "Continue me" });
    await bot.continue(person, one.id, { prompt: "Steer" });
    expect(sent.at(-1)).toMatchObject({ thread: one.id, body: { prompt: "Steer" } });
    expect(onWord.at(-1)).toBe(true);
    running = new Set();
    await bot.continue(person, one.id, { prompt: "More", reasoningEffort: "high" });
    expect(sent.at(-1)).toEqual({
      org: orgA,
      userId,
      thread: one.id,
      body: { prompt: "More", reasoningEffort: "high" },
    });
    running = new Set();
    await threadsService.saveContinuation(one.id, { waiting: true });
    await expect(bot.continue(person, one.id, { prompt: "Again" })).rejects.toThrow(
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

    await expect(bot.continue(person, theirs.id, { prompt: "Hi" })).rejects.toThrow(
      "Thread not found",
    );
    await expect(bot.archive(person, theirs.id, true)).rejects.toThrow("Thread not found");
    expect((await threadsService.readableForPerson(mateId, theirs.id)).state).toBe("open");
  });

  test("a thread of a workspace the person is not in is not found, whoever made it", async () => {
    const elsewhere = await threadsService.create(orgB, userId, {
      projectId: projectB.id,
      title: "Elsewhere",
    });
    await expect(bot.get(userId, elsewhere.id)).rejects.toThrow("Thread not found");
    await expect(bot.continue(person, elsewhere.id, { prompt: "Hi" })).rejects.toThrow(
      "Thread not found",
    );
    await expect(bot.archive(person, elsewhere.id, true)).rejects.toThrow("Thread not found");
    expect((await bot.list(userId, {})).map((thread) => thread.id)).not.toContain(elsewhere.id);
  });

  test("a thread the bot starts or continues is watched for the run it sent, and one it archives is settled", async () => {
    running = new Set();
    const one = await bot.start(person, { projectId: projectA.id, prompt: "Watch me" });
    running = new Set();
    sendStartsRun = false;
    await bot.continue(person, one.id, { prompt: "And more" });
    sendStartsRun = true;
    await bot.archive(person, one.id, true);
    await bot.archive(person, one.id, false);
    expect(watched.filter((line) => line.includes(one.id))).toEqual([
      `watch ${one.id} ${botId} run 7`,
      `watch ${one.id} ${botId} run null`,
      `settle ${one.id} ${botId}`,
    ]);
  });

  test("stopping ends the run of the person's own thread and owes no note, and with no run says so", async () => {
    running = new Set();
    const one = await bot.start(person, { projectId: projectA.id, prompt: "Stop me" });
    expect((await bot.get(userId, one.id)).lastActivityAt).toBe("2026-11-03T10:00:00.000Z");
    expect((await bot.stop(person, one.id)).running).toBe(false);
    expect(running.has(one.id)).toBe(false);
    expect(watched.at(-1)).toBe(`settle ${one.id} ${botId}`);
    await expect(bot.stop(person, one.id)).rejects.toThrow("No run is going on");
    expect(watched.at(-1)).toBe(`settle ${one.id} ${botId}`);
  });

  test("a note's follow-up is counted after its checks, uses no model of its choosing, and is kept counted", async () => {
    running = new Set();
    const one = await bot.start(person, { projectId: projectA.id, prompt: "Follow me" });
    await bot.continue(noted, one.id, {
      prompt: "Again",
      modelId: "gpt-5-pro",
      reasoningEffort: "high",
    });
    expect(sent.at(-1)).toMatchObject({ thread: one.id, body: { prompt: "Again" } });
    expect(sent.at(-1)!.body).not.toHaveProperty("modelId");
    expect(onWord.at(-1)).toBe(false);
    expect(watched.slice(-2)).toEqual([
      `follow-up ${one.id}`,
      `watch ${one.id} ${botId} run 7 follow-up`,
    ]);
    running = new Set();
    const before = watched.length;
    await expect(bot.stop(noted, one.id)).rejects.toThrow("No run is going on");
    expect(watched.length).toBe(before);
  });

  test("a note's follow-up that is refused, or fails, spends nothing", async () => {
    running = new Set();
    const one = await bot.start(person, { projectId: projectA.id, prompt: "Refuse me" });
    followUp = "unwatched";
    await expect(bot.continue(noted, one.id, { prompt: "x" })).rejects.toThrow(
      "You did not send this thread",
    );
    followUp = "spent";
    await expect(bot.continue(noted, one.id, { prompt: "x" })).rejects.toThrow(
      "Tell the person what it needs",
    );
    followUp = "ok";
    failSend = new Error("The runner is offline");
    try {
      await expect(bot.continue(noted, one.id, { prompt: "x" })).rejects.toThrow("offline");
    } finally {
      failSend = undefined;
    }
    expect(watched.at(-1)).toBe(`give back ${one.id}`);
    await bot.archive(person, one.id, true);
    const before = watched.length;
    await expect(bot.continue(noted, one.id, { prompt: "x" })).rejects.toThrow("archived");
    expect(watched.length).toBe(before);
  });

  test("a thread that could not be started is not watched", async () => {
    const before = watched.length;
    failSend = new Error("The runner is offline");
    try {
      await expect(
        bot.start(person, { projectId: projectA.id, prompt: "Unwatched" }),
      ).rejects.toThrow("The runner is offline");
    } finally {
      failSend = undefined;
    }
    expect(watched.length).toBe(before);
  });

  test("archiving puts the thread away, and false brings it back, leaving it open", async () => {
    const one = await bot.start(person, { projectId: projectA.id, prompt: "Archive me" });
    expect((await bot.archive(person, one.id, true)).state).toBe("archived");
    expect((await bot.archive(person, one.id, false)).state).toBe("open");
  });
});
