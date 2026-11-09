import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { threads } from "@aven/db/schema/threads";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { decisionModelService } from "../decision-model/service";
import { runtimesService } from "../runtimes/service";
import { ProjectNotFoundError, ThreadNotFoundError, threadsService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("threadsService (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  await decisionModelService.save(orgA, { kind: "jev", apiKey: "test-key-0000" });
  const runnerA = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const runnerB = (await runtimesService.create(orgB, userId, { name: "b" })).runtime;
  const { seedProject } = await import("../../testing/seed-project");
  const { project: projectA } = await seedProject(orgA, userId, runnerA.id, "proj");
  const { project: projectB } = await seedProject(orgB, userId, runnerB.id, "proj-b");

  const mine = { organizationId: orgA, userId };
  const teammateId = `${userId}-mate`;
  await db.insert(users).values({ id: teammateId, name: "Mate", email: `${teammateId}@aven.test` });
  const teammate = { organizationId: orgA, userId: teammateId };
  await db.insert(members).values([
    { id: `${userId}-m`, organizationId: orgA, userId, role: "owner" },
    { id: `${teammateId}-m`, organizationId: orgA, userId: teammateId, role: "member" },
  ]);

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, teammateId));
    await cleanup();
  });

  test("keeps the time of every run that carried on an answer, added up", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    await threadsService.saveWorkedTime(thread.id, 3, 40_000);
    await threadsService.saveWorkedTime(thread.id, 3, 25_000);
    await threadsService.saveWorkedTime(thread.id, 5, 1_000);
    expect(await threadsService.workedTimes(thread.id)).toEqual(
      new Map([
        [3, 65_000],
        [5, 1_000],
      ]),
    );
  });

  test("keeps who sent a message at its place, and the latest sender wins", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    await threadsService.saveSender(thread.id, 0, userId);
    await threadsService.saveSender(thread.id, 2, teammateId);
    await threadsService.saveSender(thread.id, 2, userId);
    expect(await threadsService.senders(thread.id)).toEqual(
      new Map([
        [0, userId],
        [2, userId],
      ]),
    );
  });

  test("lists who has sent a message to the thread, in the order they first did", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    expect((await threadsService.list(mine)).find((row) => row.id === thread.id)).toMatchObject({
      participants: [],
    });
    await threadsService.saveSender(thread.id, 0, teammateId);
    await threadsService.saveSender(thread.id, 2, userId);
    await threadsService.saveSender(thread.id, 4, teammateId);
    const listed = (await threadsService.list(mine)).find((row) => row.id === thread.id);
    expect(listed?.participants).toEqual([
      { id: teammateId, name: "Mate" },
      { id: userId, name: expect.any(String) },
    ]);
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

  test("multiplayer is the creator's to turn on, for a thread the workspace sees, and lapses by itself (decision 0179)", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    await expect(threadsService.update(mine, thread.id, { driving: 7 })).rejects.toThrow(
      "Share the thread",
    );
    await expect(threadsService.drivable(teammate, thread.id)).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );

    const shared = await threadsService.update(mine, thread.id, {
      visibility: "workspace",
      driving: 7,
    });
    expect(shared?.drivingUntil).toBeInstanceOf(Date);
    expect((await threadsService.drivable(teammate, thread.id)).id).toBe(thread.id);
    expect(await threadsService.update(teammate, thread.id, { driving: null })).toBeNull();

    await db
      .update(threads)
      .set({ drivingUntil: new Date(Date.now() - 1000) })
      .where(eq(threads.id, thread.id));
    await expect(threadsService.drivable(teammate, thread.id)).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
    expect((await threadsService.drivable(mine, thread.id)).id).toBe(thread.id);

    await threadsService.update(mine, thread.id, { driving: 7 });
    await db.delete(members).where(eq(members.id, `${userId}-m`));
    await expect(threadsService.drivable(teammate, thread.id)).rejects.toBeInstanceOf(
      ThreadNotFoundError,
    );
  });

  test("multiplayer needs the workspace's decision model, which an owner sets first (decision 0191)", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    await threadsService.update(mine, thread.id, { visibility: "workspace" });
    await decisionModelService.remove(orgA);
    await expect(threadsService.update(mine, thread.id, { driving: 7 })).rejects.toThrow(
      "decision model",
    );
    expect((await threadsService.owned(mine, thread.id)).drivingUntil).toBeNull();
    await decisionModelService.save(orgA, { kind: "jev", apiKey: "test-key-0000" });
    expect(
      (await threadsService.update(mine, thread.id, { driving: 7 }))?.drivingUntil,
    ).not.toBeNull();
  });

  test("making a thread private, archiving it or turning multiplayer off ends it", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    const on = () =>
      threadsService.update(mine, thread.id, { visibility: "workspace", driving: 3 });
    expect((await on())?.drivingUntil).not.toBeNull();
    expect(
      (await threadsService.update(mine, thread.id, { visibility: "private" }))?.drivingUntil,
    ).toBeNull();
    await on();
    expect(
      (await threadsService.update(mine, thread.id, { state: "archived" }))?.drivingUntil,
    ).toBeNull();
    await on();
    expect(
      (await threadsService.update(mine, thread.id, { driving: null }))?.drivingUntil,
    ).toBeNull();
  });
});
