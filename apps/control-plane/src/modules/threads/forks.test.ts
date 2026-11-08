import { afterAll, describe, expect, test } from "bun:test";

import { FORKS_PER_THREAD } from "@aven/protocol/forks";

import { ConflictError } from "../../errors";
import { runtimesService } from "../runtimes/service";
import { createThreadForks } from "./forks";
import { threadsService } from "./service";
import type { ChatMessage } from "@aven/protocol/types";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a thread's forks (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const runner = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const { project } = await seedProject(orgA, userId, runner.id, "app");
  afterAll(cleanup);

  const sent: { thread: string; prompt: string }[] = [];
  const told: { thread: string; prompt: string; onWord: boolean | undefined }[] = [];
  let failSend = false;
  let running = new Set<string>();
  const asking = new Set<string>();
  const transcript: ChatMessage[] = [
    { id: "1", role: "user", parts: [{ type: "text", text: "Try it" }] },
    { id: "2", role: "assistant", parts: [{ type: "text", text: "Done: it works." }] },
  ];
  const runs = {
    isRunning: (id: string) => running.has(id),
    history: async () => transcript,
  };
  const messages = {
    send: async (
      _org: string,
      _user: string,
      thread: string,
      { prompt }: { prompt: string },
      options?: { onPersonsWord?: boolean },
    ) => {
      if (asking.has(thread)) throw new ConflictError("Answer the agent's question first");
      told.push({ thread, prompt, onWord: options?.onPersonsWord });
      return { steered: true };
    },
    start: async (_org: string, _user: string, thread: string, { prompt }: { prompt: string }) => {
      if (failSend) throw new Error("no runner");
      sent.push({ thread, prompt });
    },
  };
  const forks = createThreadForks({ runs: runs as never, messages });
  const fewNotes = createThreadForks({ runs: runs as never, messages, waitingLimit: 2 });
  const parent = async () => {
    const thread = await threadsService.create(orgA, userId, {
      projectId: project.id,
      title: "Main",
    });
    return { id: thread.id, organizationId: orgA };
  };
  const input = { task: "Try the other approach", context: "We use bun." };

  test("makes a thread of the parent's runner that starts on the task and what the parent knows", async () => {
    const main = await parent();
    const made = await forks.start(main, input);
    const row = await threadsService.require(orgA, made.id);
    expect(row.parentThreadId).toBe(main.id);
    expect(row.runtimeId).toBe(runner.id);
    expect(row.createdBy).toBe(userId);
    expect(row.title).toBe("Try the other approach");
    const prompt = sent.find((message) => message.thread === made.id)?.prompt ?? "";
    expect(prompt).toContain("Try the other approach");
    expect(prompt).toContain("We use bun.");
    expect(prompt).toContain(`aven/${made.id.slice(0, 8)}`);
  });

  test("does not let a fork fork", async () => {
    const main = await parent();
    const made = await forks.start(main, input);
    await expect(forks.start({ id: made.id, organizationId: orgA }, input)).rejects.toThrow(
      "A fork cannot fork",
    );
  });

  test("keeps a thread to a few forks that are not archived", async () => {
    const main = await parent();
    const made = [];
    for (let i = 0; i < FORKS_PER_THREAD; i++) made.push(await forks.start(main, input));
    await expect(forks.start(main, input)).rejects.toThrow("forks that are not archived");
    await threadsService.update({ organizationId: orgA, userId }, made[0]!.id, {
      state: "archived",
    });
    await forks.start(main, input);
  });

  test("archives a fork that could not start", async () => {
    const main = await parent();
    failSend = true;
    await expect(forks.start(main, input)).rejects.toThrow("no runner");
    failSend = false;
    expect(await threadsService.liveForks(main.id)).toBe(0);
  });

  test("tells how a fork is doing, for the parent's own forks only", async () => {
    const main = await parent();
    const other = await parent();
    const made = await forks.start(main, input);
    running = new Set([made.id]);
    expect(await forks.status(main, made.id)).toMatchObject({
      id: made.id,
      running: true,
      archived: false,
      lastMessage: "Done: it works.",
    });
    await expect(forks.status(other, made.id)).rejects.toThrow("not a fork of this thread");
    running = new Set();
  });

  test("does not reach another workspace's thread", async () => {
    const main = await parent();
    await expect(
      forks.status({ id: main.id, organizationId: orgB }, crypto.randomUUID()),
    ).rejects.toThrow();
  });

  test("a fork's note that comes while the parent awaits an answer is sent once the answer's run ends, not lost", async () => {
    const main = await parent();
    const finished = await forks.start(main, input);
    const ofParent = { id: finished.id, organizationId: orgA, parentThreadId: main.id };
    await threadsService.saveContinuation(main.id, { waiting: true });
    asking.add(main.id);
    running = new Set();

    await forks.ended(ofParent, { outcome: "done" });
    expect(told.filter((entry) => entry.thread === main.id)).toEqual([]);

    await forks.ended(
      { id: main.id, organizationId: orgA, parentThreadId: null },
      { outcome: "question" },
    );
    expect(told.filter((entry) => entry.thread === main.id)).toEqual([]);

    await threadsService.clearContinuation(main.id);
    asking.delete(main.id);
    await forks.ended(
      { id: main.id, organizationId: orgA, parentThreadId: null },
      { outcome: "done" },
    );
    const delivered = told.filter((entry) => entry.thread === main.id);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.prompt).toContain(finished.id);
    expect(delivered[0]?.prompt).toContain("is done");

    await forks.ended(
      { id: main.id, organizationId: orgA, parentThreadId: null },
      { outcome: "done" },
    );
    expect(told.filter((entry) => entry.thread === main.id)).toHaveLength(1);
    told.length = 0;
  });

  test("a note queued for a parent whose run is cancelled is flushed, not lost", async () => {
    const main = await parent();
    const finished = await forks.start(main, input);
    asking.add(main.id);
    running = new Set();

    await forks.ended(
      { id: finished.id, organizationId: orgA, parentThreadId: main.id },
      { outcome: "done" },
    );
    expect(told.filter((entry) => entry.thread === main.id)).toEqual([]);

    asking.delete(main.id);
    await forks.ended(
      { id: main.id, organizationId: orgA, parentThreadId: null },
      { outcome: "cancelled" },
    );
    const delivered = told.filter((entry) => entry.thread === main.id);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.prompt).toContain(finished.id);
    expect(delivered[0]?.onWord).toBe(false);

    await forks.ended(
      { id: main.id, organizationId: orgA, parentThreadId: null },
      { outcome: "cancelled" },
    );
    expect(told.filter((entry) => entry.thread === main.id)).toHaveLength(1);
    told.length = 0;
  });

  test("keeps the notes it holds to a limit, dropping the oldest", async () => {
    const mains = [await parent(), await parent(), await parent()];
    const made: string[] = [];
    running = new Set();
    for (const main of mains) asking.add(main.id);
    for (const main of mains) {
      const fork = await fewNotes.start(main, input);
      made.push(fork.id);
      await fewNotes.ended(
        { id: fork.id, organizationId: orgA, parentThreadId: main.id },
        { outcome: "done" },
      );
    }
    for (const main of mains) asking.delete(main.id);

    await fewNotes.ended(
      { id: mains[0]!.id, organizationId: orgA, parentThreadId: null },
      { outcome: "done" },
    );
    expect(told.filter((entry) => entry.thread === mains[0]!.id)).toEqual([]);

    await fewNotes.ended(
      { id: mains[2]!.id, organizationId: orgA, parentThreadId: null },
      { outcome: "done" },
    );
    const delivered = told.filter((entry) => entry.thread === mains[2]!.id);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.prompt).toContain(made[2]!);

    await fewNotes.ended(
      { id: mains[1]!.id, organizationId: orgA, parentThreadId: null },
      { outcome: "done" },
    );
    expect(told.filter((entry) => entry.thread === mains[1]!.id)).toHaveLength(1);
    told.length = 0;
  });

  test("tells a working parent at once, and wakes an idle one when its last fork has ended (decision 0142)", async () => {
    const main = await parent();
    const first = await forks.start(main, input);
    const second = await forks.start(main, input);
    const ofParent = (id: string) => ({ id, organizationId: orgA, parentThreadId: main.id });

    running = new Set([second.id]);
    await forks.ended(ofParent(first.id), { outcome: "done" });
    expect(told).toEqual([]);

    running = new Set();
    await forks.ended(ofParent(second.id), { outcome: "done" });
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ thread: main.id, onWord: false });
    expect(told[0]?.prompt).toContain(first.id);
    expect(told[0]?.prompt).toContain(second.id);

    told.length = 0;
    running = new Set([main.id, first.id]);
    await forks.ended(ofParent(second.id), { outcome: "done" });
    expect(told).toHaveLength(1);
    expect(told[0]?.prompt).toContain("is done");

    told.length = 0;
    await forks.ended(ofParent(second.id), { outcome: "cancelled" });
    await forks.ended({ ...ofParent(second.id), parentThreadId: null }, { outcome: "done" });
    expect(told).toEqual([]);
    running = new Set();
  });

  test("keeps to the limit when the agent forks several times at once", async () => {
    const main = await parent();
    const results = await Promise.allSettled(
      Array.from({ length: FORKS_PER_THREAD + 2 }, () => forks.start(main, input)),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      FORKS_PER_THREAD,
    );
    expect(await threadsService.liveForks(main.id)).toBe(FORKS_PER_THREAD);
  });
});
