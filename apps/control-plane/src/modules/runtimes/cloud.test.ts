import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { runtimes } from "@aven/db/schema/runtimes";
import { eq } from "drizzle-orm";

import { projectsService } from "../projects/service";
import { threadsService } from "../threads/service";
import { CLOUD_RUNTIME_ID, runtimesService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("Aven Cloud runtime (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const keptKey = process.env.AVEN_BOAT_API_KEY;
  const keptLimit = process.env.AVEN_CLOUD_MAX_SANDBOXES;
  const [kept] = await db.select().from(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

  beforeAll(() => {
    process.env.AVEN_BOAT_API_KEY = "boat_test_key_for_cloud";
    delete process.env.AVEN_CLOUD_MAX_SANDBOXES;
  });

  afterAll(async () => {
    await cleanup();

    if (!kept) await db.delete(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

    if (keptKey === undefined) delete process.env.AVEN_BOAT_API_KEY;
    else process.env.AVEN_BOAT_API_KEY = keptKey;

    if (keptLimit === undefined) delete process.env.AVEN_CLOUD_MAX_SANDBOXES;
    else process.env.AVEN_CLOUD_MAX_SANDBOXES = keptLimit;
  });

  test("Aven Cloud is listed for every workspace once the platform has a boat key, and only then", async () => {
    delete process.env.AVEN_BOAT_API_KEY;
    await runtimesService.ensureCloud();
    expect((await runtimesService.list(orgA, userId)).map(({ id }) => id)).not.toContain(
      CLOUD_RUNTIME_ID,
    );

    process.env.AVEN_BOAT_API_KEY = "boat_test_key_for_cloud";
    await runtimesService.ensureCloud();

    for (const org of [orgA, orgB]) {
      const listed = await runtimesService.list(org, userId);
      expect(listed.find(({ id }) => id === CLOUD_RUNTIME_ID)).toMatchObject({
        name: "Aven Cloud",
        provider: "boat",
        lifetime: "ephemeral",
        githubMode: "person",
      });
    }
  });

  test("the Aven Cloud template cannot be renamed or told which GitHub to use", async () => {
    expect(await runtimesService.rename(orgA, CLOUD_RUNTIME_ID, "Mine")).toBeNull();
    expect(await runtimesService.setGithubMode(orgA, CLOUD_RUNTIME_ID, "machine")).toBeNull();
    expect((await runtimesService.get(orgA, CLOUD_RUNTIME_ID))?.name).toBe("Aven Cloud");
  });

  test("a thread on Aven Cloud gets a computer of its own that the runtime list does not show", async () => {
    const { project } = await seedProject(orgA, userId, null, "cloud-repo");
    const first = await threadsService.create(orgA, userId, {
      projectId: project.id,
      runtimeId: CLOUD_RUNTIME_ID,
    });
    const second = await threadsService.create(orgA, userId, {
      projectId: project.id,
      runtimeId: CLOUD_RUNTIME_ID,
    });

    expect(first.runtimeId).not.toBe(CLOUD_RUNTIME_ID);
    expect(second.runtimeId).not.toBe(CLOUD_RUNTIME_ID);
    expect(second.runtimeId).not.toBe(first.runtimeId);

    const [child] = await db.select().from(runtimes).where(eq(runtimes.id, first.runtimeId));
    expect(child).toMatchObject({
      organizationId: orgA,
      ownerId: userId,
      parentRuntimeId: CLOUD_RUNTIME_ID,
      provider: "boat",
      lifetime: "ephemeral",
      boatSandboxId: null,
    });
    expect(child!.boatRunnerTokenEncrypted).not.toBeNull();

    const listed = (await runtimesService.list(orgA, userId)).map(({ id }) => id);
    expect(listed).not.toContain(first.runtimeId);
    expect(listed).not.toContain(second.runtimeId);

    const record = await runtimesService.boatRecord(first.runtimeId);
    expect(record).toMatchObject({
      runtimeId: first.runtimeId,
      apiKey: "boat_test_key_for_cloud",
      sandboxId: null,
    });
    expect((await runtimesService.authenticate(record!.runnerToken))?.id).toBe(first.runtimeId);
    expect(JSON.stringify(child)).not.toContain(record!.runnerToken);

    const rotated = await runtimesService.rotate(orgA, userId, first.runtimeId);
    expect((await runtimesService.boatRecord(first.runtimeId))?.runnerToken).toBe(rotated!.token);
    expect(await runtimesService.authenticate(record!.runnerToken)).toBeNull();
  });

  test("a repository project with no runtime runs wherever the thread is started, and a folder project only on its own computer", async () => {
    const { project: repository } = await seedProject(orgA, userId, null, "free-repo");
    const mac = (await runtimesService.create(orgA, userId, { name: "mac2" })).runtime;
    await runtimesService.setDirectories(mac.id, ["/home/me/code"]);
    const other = (await runtimesService.create(orgA, userId, { name: "mac3" })).runtime;
    const folder = await projectsService.addFolder(orgA, userId, {
      runtimeId: mac.id,
      path: "/home/me/code/app",
    });

    const onMac = await threadsService.create(orgA, userId, {
      projectId: repository.id,
      runtimeId: mac.id,
    });
    expect(onMac.runtimeId).toBe(mac.id);

    await expect(
      threadsService.create(orgA, userId, { projectId: folder.id, runtimeId: other.id }),
    ).rejects.toThrow("folder on one computer");
    await expect(
      threadsService.create(orgA, userId, { projectId: folder.id, runtimeId: CLOUD_RUNTIME_ID }),
    ).rejects.toThrow("folder on one computer");
    expect((await threadsService.create(orgA, userId, { projectId: folder.id })).runtimeId).toBe(
      mac.id,
    );
  });

  test("a workspace cannot hold more Aven Cloud computers than its limit", async () => {
    const { project } = await seedProject(orgB, userId, null, "limit-repo");
    const existing = (await runtimesService.list(orgB, userId)).length;
    process.env.AVEN_CLOUD_MAX_SANDBOXES = "2";

    await threadsService.create(orgB, userId, {
      projectId: project.id,
      runtimeId: CLOUD_RUNTIME_ID,
    });
    await threadsService.create(orgB, userId, {
      projectId: project.id,
      runtimeId: CLOUD_RUNTIME_ID,
    });
    await expect(
      threadsService.create(orgB, userId, { projectId: project.id, runtimeId: CLOUD_RUNTIME_ID }),
    ).rejects.toThrow("2 Aven Cloud computers");
    expect((await runtimesService.list(orgB, userId)).length).toBe(existing);
  });

  test("without a boat key Aven Cloud cannot start a thread", async () => {
    delete process.env.AVEN_BOAT_API_KEY;
    const { project } = await seedProject(orgA, userId, null, "no-key-repo");

    await expect(
      threadsService.create(orgA, userId, { projectId: project.id, runtimeId: CLOUD_RUNTIME_ID }),
    ).rejects.toThrow();
  });
});
