import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { threads } from "@aven/db/schema/threads";
import { users } from "@aven/db/schema/users";
import { ConflictError, ForbiddenError, NotFoundError } from "@aven/server-kit/errors";
import { eq } from "drizzle-orm";

import { runtimesService } from "../runtimes/service";
import { threadsService } from "../threads/service";
import { createGitCenterService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("gitCenterService handoff isolation (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const suffix = crypto.randomUUID().slice(0, 8);
  const teammateId = `gc-mate-${suffix}`;
  await db.insert(users).values({
    id: teammateId,
    name: "Teammate",
    email: `${teammateId}@aven.test`,
  });
  await db.insert(members).values({
    id: `gc-mem-${suffix}`,
    organizationId: orgA,
    userId: teammateId,
    role: "member",
    createdAt: new Date(),
  });

  const runner = (await runtimesService.create(orgA, userId, { name: "gc-runner" })).runtime;
  const { project: projectA } = await seedProject(orgA, userId, runner.id, "gc-a");
  const { project: projectB } = await seedProject(orgA, userId, runner.id, "gc-b");

  const threadA = await threadsService.create(orgA, userId, {
    projectId: projectA.id,
    title: "Project A thread",
  });
  const threadB = await threadsService.create(orgA, userId, {
    projectId: projectB.id,
    title: "Project B thread",
  });
  await db.update(threads).set({ visibility: "workspace" }).where(eq(threads.id, threadA.id));

  afterAll(async () => {
    await cleanup();
    await db.delete(users).where(eq(users.id, teammateId));
  });

  test("rejects conflict handoff when target thread belongs to another project", async () => {
    const sent: string[] = [];
    const service = createGitCenterService(
      { get: () => undefined },
      { isRunning: () => false },
      {
        send: async (_orgId, _userId, threadId) => {
          sent.push(threadId);
          return { steered: false };
        },
      },
    );

    await expect(
      service.handoff({ organizationId: orgA, userId }, projectA.id, {
        kind: "resolve_conflicts",
        operation: "merge",
        files: ["README.md"],
        threadId: threadB.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(sent).toEqual([]);
  });

  test("rejects conflict handoff when the thread has an active run or viewer cannot drive", async () => {
    const sent: string[] = [];
    const runningService = createGitCenterService(
      { get: () => undefined },
      { isRunning: (id) => id === threadA.id },
      {
        send: async (_orgId, _userId, threadId) => {
          sent.push(threadId);
          return { steered: false };
        },
      },
    );

    await expect(
      runningService.handoff({ organizationId: orgA, userId }, projectA.id, {
        kind: "resolve_conflicts",
        operation: "rebase",
        files: ["src/index.ts"],
        threadId: threadA.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const idleService = createGitCenterService(
      { get: () => undefined },
      { isRunning: () => false },
      {
        send: async (_orgId, _userId, threadId) => {
          sent.push(threadId);
          return { steered: false };
        },
      },
    );

    await expect(
      idleService.handoff({ organizationId: orgA, userId: teammateId }, projectA.id, {
        kind: "resolve_conflicts",
        operation: "rebase",
        files: ["src/index.ts"],
        threadId: threadA.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const ok = await idleService.handoff({ organizationId: orgA, userId }, projectA.id, {
      kind: "resolve_conflicts",
      operation: "merge",
      files: ["src/index.ts"],
      threadId: threadA.id,
    });
    expect(ok).toEqual({ threadId: threadA.id, created: false });
    expect(sent).toEqual([threadA.id]);
  });

  test("coalesces identical concurrent snapshots but separates requests with different limits", async () => {
    const service = createGitCenterService(
      { get: () => undefined },
      { isRunning: () => false },
      { send: async () => ({ steered: false }) },
    );
    const viewer = { organizationId: orgA, userId };
    const first = service.snapshot(viewer, projectA.id, { page: 1, limit: 25 });
    const same = service.snapshot(viewer, projectA.id, { page: 1, limit: 25 });
    const differentLimit = service.snapshot(viewer, projectA.id, { page: 1, limit: 100 });

    expect(same).toBe(first);
    expect(differentLimit).not.toBe(first);

    await Promise.all([first, differentLimit]);
  });
});
