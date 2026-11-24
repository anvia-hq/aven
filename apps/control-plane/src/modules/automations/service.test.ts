import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { AutomationRunner } from "./types";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("automations (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { automations: automationsTable } = await import("@aven/db/schema/automations");
  const { members } = await import("@aven/db/schema/members");
  const { organizations } = await import("@aven/db/schema/organizations");
  const { projects } = await import("@aven/db/schema/projects");
  const { runtimes } = await import("@aven/db/schema/runtimes");
  const { threads } = await import("@aven/db/schema/threads");
  const { users } = await import("@aven/db/schema/users");
  const { eq, inArray } = await import("drizzle-orm");
  const { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } =
    await import("@aven/server-kit/errors");
  const { createAutomationScheduler } = await import("./scheduler");
  const { createAutomations } = await import("./service");

  const suffix = crypto.randomUUID().slice(0, 8);
  const orgId = `org-auto-${suffix}`;
  const alice = `u-auto-a-${suffix}`;
  const bob = `u-auto-b-${suffix}`;
  const runtimeA = crypto.randomUUID();
  const runtimeB = crypto.randomUUID();
  const repoProjectId = crypto.randomUUID();
  const folderProjectId = crypto.randomUUID();

  beforeAll(async () => {
    await db.insert(organizations).values({
      id: orgId,
      name: "Auto Org",
      slug: `auto-org-${suffix}`,
    });
    await db.insert(users).values([
      { id: alice, name: "Alice", email: `${alice}@aven.test` },
      { id: bob, name: "Bob", email: `${bob}@aven.test` },
    ]);
    await db.insert(members).values([
      { id: `m-a-${suffix}`, organizationId: orgId, userId: alice, role: "owner" },
      { id: `m-b-${suffix}`, organizationId: orgId, userId: bob, role: "member" },
    ]);
    await db.insert(runtimes).values([
      {
        id: runtimeA,
        organizationId: orgId,
        ownerId: alice,
        name: "Alice Mac",
        tokenHash: `hash-a-${suffix}`,
        tokenHint: "aaaa",
      },
      {
        id: runtimeB,
        organizationId: orgId,
        ownerId: alice,
        name: "Backup Mac",
        tokenHash: `hash-b-${suffix}`,
        tokenHint: "bbbb",
      },
    ]);
    await db.insert(projects).values([
      {
        id: repoProjectId,
        organizationId: orgId,
        createdBy: alice,
        name: "Web App",
        runtimeId: null,
        repoFullName: "acme/web",
      },
      {
        id: folderProjectId,
        organizationId: orgId,
        createdBy: alice,
        name: "Local Folder",
        runtimeId: runtimeA,
        directory: "/tmp/local-folder",
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(automationsTable).where(eq(automationsTable.organizationId, orgId));
    await db.delete(threads).where(eq(threads.organizationId, orgId));
    await db.delete(projects).where(eq(projects.organizationId, orgId));
    await db.delete(runtimes).where(inArray(runtimes.id, [runtimeA, runtimeB]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(users).where(inArray(users.id, [alice, bob]));
  });

  async function insertRealThread(input: {
    organizationId: string;
    userId: string;
    projectId: string;
    runtimeId: string;
    title: string;
  }) {
    const [thread] = await db
      .insert(threads)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        createdBy: input.userId,
        runtimeId: input.runtimeId,
        title: input.title,
      })
      .returning({ id: threads.id, runtimeId: threads.runtimeId });
    return { threadId: thread!.id, runtimeId: thread!.runtimeId };
  }

  const viewerA = { organizationId: orgId, userId: alice };
  const viewerB = { organizationId: orgId, userId: bob };

  test("validates folder-project runtime affinity and rejects schedule fields on webhook updates", async () => {
    const service = createAutomations({
      runner: { createThread: insertRealThread, startRun: async () => undefined },
    });

    await expect(
      service.create(viewerA, {
        name: "Wrong box",
        projectId: folderProjectId,
        runtimeId: runtimeB,
        triggerKind: "webhook",
        prompt: "Fix bugs",
      }),
    ).rejects.toThrow(UnprocessableError);

    const created = await service.create(viewerA, {
      name: "Crash triage",
      projectId: repoProjectId,
      runtimeId: runtimeA,
      triggerKind: "webhook",
      prompt: "Investigate crashes",
    });

    expect(created.webhookToken).toStartWith("avnau_");
    expect((await service.list(viewerA)).map((item) => item.id)).toContain(created.id);
    expect((await service.list(viewerB)).map((item) => item.id)).not.toContain(created.id);

    await expect(service.update(viewerA, created.id, { cron: "0 9 * * *" })).rejects.toThrow(
      UnprocessableError,
    );

    const updated = await service.update(viewerA, created.id, { name: "Crash triage v2" });
    expect(updated?.name).toBe("Crash triage v2");
  });

  test("links thread before startRun, handles immediate completion, avoids clobbering, and abandons on start failure", async () => {
    const abandoned: string[] = [];
    let onStart: ((threadId: string) => Promise<void>) | undefined;
    const runner: AutomationRunner = {
      createThread: insertRealThread,
      startRun: async ({ threadId }) => {
        if (onStart) await onStart(threadId);
      },
      abandonThread: async ({ threadId }) => {
        abandoned.push(threadId);
      },
    };
    const service = createAutomations({ runner, maxConcurrentRuns: 2 });
    const created = await service.create(viewerA, {
      name: "Fast & overlapping",
      projectId: repoProjectId,
      runtimeId: runtimeA,
      triggerKind: "webhook",
      prompt: "Patch",
    });

    onStart = async (threadId) => {
      await service.recordThreadEnded(threadId, "done");
    };
    const fastRun = await service.triggerManual(viewerA, created.id);
    expect(fastRun.threadId).toBeTruthy();

    const runsAfterFast = await service.runs(viewerA, created.id);
    expect(runsAfterFast[0]?.status).toBe("done");
    expect((await service.list(viewerA)).find((a) => a.id === created.id)?.lastStatus).toBe("done");

    onStart = undefined;
    const older = await service.triggerManual(viewerA, created.id);
    const newer = await service.triggerManual(viewerA, created.id);

    await expect(service.triggerManual(viewerA, created.id)).rejects.toThrow(ConflictError);

    await service.recordThreadEnded(newer.threadId!, "done");
    await service.recordThreadEnded(older.threadId!, "failed", "old error");

    expect((await service.list(viewerA)).find((a) => a.id === created.id)?.lastStatus).toBe("done");

    onStart = async () => {
      throw new Error("Runner offline");
    };
    const failed = await service.triggerManual(viewerA, created.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("Runner offline");
    expect(abandoned).toEqual([failed.threadId!]);
  });

  test("disables automations and refuses execution when the owner leaves the organization", async () => {
    let memberNow = true;
    const started: string[] = [];
    const service = createAutomations({
      runner: {
        createThread: insertRealThread,
        startRun: async ({ threadId }) => void started.push(threadId),
      },
      isMember: async () => memberNow,
    });
    const created = await service.create(viewerA, {
      name: "Member check",
      projectId: repoProjectId,
      runtimeId: runtimeA,
      triggerKind: "webhook",
      prompt: "Check alerts",
    });

    await expect(
      service.receiveWebhook(created.id, { token: "avnau_wrong", body: "{}", headers: {} }),
    ).rejects.toThrow(NotFoundError);

    memberNow = false;
    await expect(
      service.receiveWebhook(created.id, {
        token: created.webhookToken!,
        body: "{}",
        headers: {},
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(started).toEqual([]);
    const listed = (await service.list(viewerA)).find((a) => a.id === created.id);
    expect(listed?.enabled).toBe(false);
  });

  test("scheduler isolates malformed rows and still fires valid due automations", async () => {
    const service = createAutomations({
      runner: { createThread: insertRealThread, startRun: async () => undefined },
    });
    const bad = await service.create(viewerA, {
      name: "Malformed cron",
      projectId: repoProjectId,
      runtimeId: runtimeA,
      triggerKind: "schedule",
      cron: "0 9 * * *",
      timezone: "UTC",
      prompt: "Run daily",
    });
    const good = await service.create(viewerA, {
      name: "Healthy cron",
      projectId: repoProjectId,
      runtimeId: runtimeA,
      triggerKind: "schedule",
      cron: "0 9 * * *",
      timezone: "UTC",
      prompt: "Run daily",
    });
    const past = new Date(Date.now() - 60_000);
    await db
      .update(automationsTable)
      .set({ cron: "not a cron", nextRunAt: past })
      .where(eq(automationsTable.id, bad.id));
    await db
      .update(automationsTable)
      .set({ nextRunAt: new Date(past.getTime() + 1_000) })
      .where(eq(automationsTable.id, good.id));

    const fired: string[] = [];
    const scheduler = createAutomationScheduler({
      intervalMs: 60_000,
      fireDue: async (id) => {
        fired.push(id);
      },
    });

    await scheduler.tick(new Date());
    expect(fired).toEqual([good.id]);
  });
});
