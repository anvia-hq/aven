import { afterAll, describe, expect, test } from "bun:test";

import type { ChatMessage } from "@aven/protocol/types";
import { threadBranch } from "@aven/protocol/thread-branch";

import { runtimesService } from "../runtimes/service";
import { createThreadContinuation } from "./continuation";
import { threadsService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a thread continued on another runner (postgres, decision 0152)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const from = (await runtimesService.create(orgA, userId, { name: "laptop" })).runtime;
  const to = (await runtimesService.create(orgA, userId, { name: "big-box" })).runtime;
  const { project } = await seedProject(orgA, userId, from.id, "app");
  afterAll(cleanup);

  const viewer = { organizationId: orgA, userId };
  const started: { thread: string; prompt: string; files: string[]; modelId?: string }[] = [];
  let failStart = false;
  const freed: { id: string; runtimeId: string }[] = [];
  let online = new Set<string>([to.id]);
  let running = false;
  let patch: { patch: string; truncated: boolean } | null = {
    patch: "diff --git a/x b/x\n",
    truncated: false,
  };
  const transcript: ChatMessage[] = [
    { id: "1", role: "user", parts: [{ type: "text", text: "Add a pager" }] },
    { id: "2", role: "assistant", parts: [{ type: "text", text: "The pager is half done." }] },
  ];
  const continuation = createThreadContinuation({
    runs: { isRunning: () => running, history: async () => transcript } as never,
    hub: { isOnline: (id: string) => online.has(id) },
    messages: {
      start: async (
        _org: string,
        _user: string,
        thread: string,
        body: { prompt: string; attachments?: { name: string }[]; modelId?: string },
      ) => {
        if (failStart) throw new Error("no model");

        started.push({
          thread,
          prompt: body.prompt,
          files: (body.attachments ?? []).map((file) => file.name),
          modelId: body.modelId,
        });
      },
    } as never,
    patchOf: async () => patch,
    putAway: (thread) => void freed.push(thread),
  });
  const oldThread = async () =>
    threadsService.create(orgA, userId, { projectId: project.id, title: "Pager" });

  test("makes a thread on the other runner with the summary and the old changes as a patch", async () => {
    const old = await oldThread();
    const created = await continuation.continueOn(viewer, old.id, to.id, { modelId: "gpt-x" });
    expect(started.at(-1)!.modelId).toBe("gpt-x");
    expect(created.runtimeId).toBe(to.id);
    expect(created.projectId).toBe(project.id);
    expect(created.id).not.toBe(old.id);
    expect(created.parentThreadId).toBeNull();
    const first = started.at(-1)!;
    expect(first.thread).toBe(created.id);
    expect(first.files).toEqual(["previous-thread.patch"]);
    expect(first.prompt).toStartWith('[continued] Continued from "Pager", now on big-box');
    expect(first.prompt).toContain("The pager is half done.");
    expect(first.prompt).toContain(threadBranch(created.id));
    expect((await threadsService.get(orgA, old.id))?.runtimeId).toBe(from.id);
    expect((await threadsService.get(orgA, old.id))?.state).not.toBe("archived");
  });

  test("says so when the old changes could not be had, and sends no file", async () => {
    const old = await oldThread();
    patch = null;
    await continuation.continueOn(viewer, old.id, to.id);
    const first = started.at(-1)!;
    expect(first.files).toEqual([]);
    expect(first.prompt).toContain("could not be reached, or its changes are too large");
    patch = { patch: "", truncated: false };
    await continuation.continueOn(viewer, old.id, to.id);
    expect(started.at(-1)!.prompt).toContain("had changed nothing");
    patch = { patch: "x", truncated: true };
    await continuation.continueOn(viewer, old.id, to.id);
    expect(started.at(-1)!.files).toEqual([]);
    patch = { patch: "あ".repeat(1_500_000), truncated: false };
    await continuation.continueOn(viewer, old.id, to.id);
    expect(started.at(-1)!.files).toEqual([]);
    expect(started.at(-1)!.prompt).toContain("too large to carry");
    patch = { patch: "diff\n", truncated: false };
  });

  test("refuses the same runner, an offline one, a working agent and another workspace's runner", async () => {
    const old = await oldThread();
    await expect(continuation.continueOn(viewer, old.id, from.id)).rejects.toThrow("already");
    online = new Set();
    await expect(continuation.continueOn(viewer, old.id, to.id)).rejects.toThrow("offline");
    online = new Set([to.id]);
    running = true;
    await expect(continuation.continueOn(viewer, old.id, to.id)).rejects.toThrow("working");
    running = false;
    const foreign = (await runtimesService.create(orgB, userId, { name: "theirs" })).runtime;
    await expect(continuation.continueOn(viewer, old.id, foreign.id)).rejects.toThrow(
      "Runner not found",
    );
  });

  test("archives the new thread when it could not start", async () => {
    const old = await oldThread();
    failStart = true;
    freed.length = 0;
    const before = new Set((await threadsService.list(viewer)).map((thread) => thread.id));
    await expect(continuation.continueOn(viewer, old.id, to.id)).rejects.toThrow("no model");
    failStart = false;
    const made = (await threadsService.list(viewer)).filter((thread) => !before.has(thread.id));
    expect(made.map(({ runtimeId, state }) => ({ runtimeId, state }))).toEqual([
      { runtimeId: to.id, state: "archived" },
    ]);
    expect(freed).toEqual([{ id: made[0]!.id, runtimeId: to.id }]);
  });
});
