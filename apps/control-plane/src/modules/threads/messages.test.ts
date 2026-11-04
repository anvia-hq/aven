import { afterAll, describe, expect, test } from "bun:test";

import { runtimesService } from "../runtimes/service";
import { createThreadMessages } from "./messages";
import { threadsService } from "./service";

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
