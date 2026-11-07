import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { runtimesService } from "../runtimes/service";
import { ProjectNotFoundError, ThreadNotFoundError, threadsService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("threadsService (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const runnerA = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const runnerB = (await runtimesService.create(orgB, userId, { name: "b" })).runtime;
  const { seedProject } = await import("../../testing/seed-project");
  const { project: projectA } = await seedProject(orgA, userId, runnerA.id, "proj");
  const { project: projectB } = await seedProject(orgB, userId, runnerB.id, "proj-b");

  const mine = { organizationId: orgA, userId };
  const teammateId = `${userId}-mate`;
  await db.insert(users).values({ id: teammateId, name: "Mate", email: `${teammateId}@aven.test` });
  const teammate = { organizationId: orgA, userId: teammateId };

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, teammateId));
    await cleanup();
  });

  test("creates a thread titled after the project and lists it", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    expect(thread.title).toBe("proj");
    expect(thread.projectId).toBe(projectA.id);
    expect(thread.runtimeId).toBe(runnerA.id);
    expect(thread).not.toHaveProperty("projectPath");
    expect((await threadsService.list(mine)).map((row) => row.id)).toContain(thread.id);
  });

  test("another organization cannot see, read or change the thread", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    expect(await threadsService.get(orgB, thread.id)).toBeNull();
    expect(
      await threadsService.update({ organizationId: orgB, userId }, thread.id, { title: "hijack" }),
    ).toBeNull();
    expect(
      (await threadsService.list({ organizationId: orgB, userId })).map((row) => row.id),
    ).not.toContain(thread.id);
    expect((await threadsService.get(orgA, thread.id))?.title).not.toBe("hijack");
  });

  test("rejects a project belonging to another organization", async () => {
    const before = (await threadsService.list(mine)).length;
    await expect(
      threadsService.create(orgA, userId, { projectId: projectB.id }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect((await threadsService.list(mine)).length).toBe(before);
  });

  test("a waiting question is kept server-side: clients only learn that there is one", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    expect(thread.awaitingAnswer).toBe(false);

    await threadsService.saveContinuation(thread.id, { state: "private" });
    const read = await threadsService.get(orgA, thread.id);
    expect(read?.awaitingAnswer).toBe(true);
    expect(read).not.toHaveProperty("pendingContinuation");
    expect(
      (await threadsService.list(mine)).find((row) => row.id === thread.id),
    ).not.toHaveProperty("pendingContinuation");
    expect(await threadsService.continuation(thread.id)).toEqual({ state: "private" });

    await threadsService.clearContinuation(thread.id);
    expect((await threadsService.get(orgA, thread.id))?.awaitingAnswer).toBe(false);
    expect(await threadsService.continuation(thread.id)).toBeNull();
  });

  test("a thread carries its pull requests, newest first, each only its own", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    const other = await threadsService.create(orgA, userId, { projectId: projectA.id });
    expect(thread.pullRequests).toEqual([]);

    const first = {
      number: 3,
      url: "https://github.com/acme/app/pull/3",
      branch: "aven/abc",
      title: "First",
      state: "open" as const,
    };
    const second = { ...first, number: 5, branch: "aven/abc-docs", title: "Second" };
    await threadsService.savePullRequests(thread.id, [first]);
    await threadsService.savePullRequests(thread.id, [second]);

    expect((await threadsService.get(orgA, thread.id))?.pullRequests).toEqual([second, first]);
    expect((await threadsService.get(orgA, other.id))?.pullRequests).toEqual([]);
    expect(
      (await threadsService.list(mine)).find((row) => row.id === thread.id)?.pullRequests,
    ).toEqual([second, first]);
    expect(
      (await threadsService.update(mine, thread.id, { title: "renamed" }))?.pullRequests,
    ).toEqual([second, first]);
  });

  test("saving again brings a known pull request up to date and does not repeat it", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    const pull = {
      number: 9,
      url: "https://github.com/acme/app/pull/9",
      branch: "aven/abc",
      title: "Before",
      state: "open" as const,
    };
    await threadsService.savePullRequests(thread.id, [pull]);
    await threadsService.savePullRequests(thread.id, [
      { ...pull, title: "After", state: "merged" },
    ]);
    await threadsService.savePullRequests(thread.id, []);

    expect((await threadsService.get(orgA, thread.id))?.pullRequests).toEqual([
      { ...pull, title: "After", state: "merged" },
    ]);
  });

  test("a thread is its creator's: a teammate does not see it, read it or change it", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    expect((await threadsService.list(teammate)).map((row) => row.id)).not.toContain(thread.id);
    await expect(threadsService.readable(teammate, thread.id)).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
    await expect(threadsService.owned(teammate, thread.id)).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
    expect(await threadsService.update(teammate, thread.id, { title: "hijack" })).toBeNull();
    expect((await threadsService.owned(mine, thread.id)).title).not.toBe("hijack");
  });

  test("a thread shared with the workspace can be read by a teammate, and only read", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    expect(thread.visibility).toBe("private");
    const shared = await threadsService.update(mine, thread.id, { visibility: "workspace" });
    expect(shared?.visibility).toBe("workspace");
    expect(shared?.createdByName).toBe("T");

    expect((await threadsService.list(teammate)).map((row) => row.id)).toContain(thread.id);
    expect((await threadsService.readable(teammate, thread.id)).id).toBe(thread.id);
    await expect(threadsService.owned(teammate, thread.id)).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
    expect(await threadsService.update(teammate, thread.id, { visibility: "private" })).toBeNull();
    expect((await threadsService.readable(mine, thread.id)).visibility).toBe("workspace");

    await threadsService.update(mine, thread.id, { visibility: "private" });
    await expect(threadsService.readable(teammate, thread.id)).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
  });

  test("a shared thread is not shown to another organization", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    await threadsService.update(mine, thread.id, { visibility: "workspace" });
    const outsider = { organizationId: orgB, userId: teammateId };
    expect((await threadsService.list(outsider)).map((row) => row.id)).not.toContain(thread.id);
    await expect(threadsService.readable(outsider, thread.id)).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
  });
});
