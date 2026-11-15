import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { runtimes } from "@aven/db/schema/runtimes";
import { eq } from "drizzle-orm";

import { joinOrganization, signUp } from "../../testing/sign-up";
import { projectsService } from "../projects/service";
import { threadsService } from "../threads/service";
import { cloudProvider } from "./cloud-config";
import { reachRunner } from "./providers";
import { CLOUD_OFF, CLOUD_RUNTIME_ID, runtimesService } from "./service";
import { requireUsableRuntime } from "./usable";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("Aven Cloud runtime (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const keptKey = process.env.AVEN_BOAT_API_KEY;
  const keptLimit = process.env.AVEN_CLOUD_MAX_SANDBOXES;
  const keptProvider = process.env.AVEN_CLOUD_PROVIDER;
  const [kept] = await db.select().from(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

  beforeAll(() => {
    process.env.AVEN_BOAT_API_KEY = "boat_test_key_for_cloud";
    process.env.AVEN_CLOUD_PROVIDER = "boat";
    delete process.env.AVEN_CLOUD_MAX_SANDBOXES;
  });

  afterAll(async () => {
    await cleanup();

    if (!kept) await db.delete(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

    if (keptKey === undefined) delete process.env.AVEN_BOAT_API_KEY;
    else process.env.AVEN_BOAT_API_KEY = keptKey;

    if (keptLimit === undefined) delete process.env.AVEN_CLOUD_MAX_SANDBOXES;
    else process.env.AVEN_CLOUD_MAX_SANDBOXES = keptLimit;

    if (keptProvider === undefined) delete process.env.AVEN_CLOUD_PROVIDER;
    else process.env.AVEN_CLOUD_PROVIDER = keptProvider;
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

  test("a thread on Aven Cloud gets a computer of its own that is listed only to its owner", async () => {
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
    expect(listed).toContain(first.runtimeId);
    expect(listed).toContain(second.runtimeId);

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

  test("a teammate cannot put a thread on a computer that belongs to someone else's thread", async () => {
    const { project } = await seedProject(orgA, userId, null, "teammate-repo");
    const mine = await threadsService.create(orgA, userId, {
      projectId: project.id,
      runtimeId: CLOUD_RUNTIME_ID,
    });
    const teammate = await signUp("cloud-mate");

    try {
      await joinOrganization(teammate, orgA, "member");
      expect(await runtimesService.get(orgA, mine.runtimeId, userId)).not.toBeNull();
      expect(await runtimesService.get(orgA, mine.runtimeId, teammate.userId)).toBeNull();
      expect((await runtimesService.list(orgA, teammate.userId)).map(({ id }) => id)).not.toContain(
        mine.runtimeId,
      );
      await expect(requireUsableRuntime(teammate.userId, mine.runtimeId)).rejects.toThrow(
        "not one you can use",
      );
      await expect(requireUsableRuntime(userId, mine.runtimeId)).resolves.toBeUndefined();
      await expect(
        threadsService.create(orgA, teammate.userId, {
          projectId: project.id,
          runtimeId: mine.runtimeId,
        }),
      ).rejects.toThrow("private to its owner");
    } finally {
      await teammate.remove();
    }
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

    try {
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
      expect((await runtimesService.list(orgB, userId)).length).toBe(existing + 2);
    } finally {
      delete process.env.AVEN_CLOUD_MAX_SANDBOXES;
    }
  });

  test("without a boat key Aven Cloud cannot start a thread", async () => {
    delete process.env.AVEN_BOAT_API_KEY;
    const { project } = await seedProject(orgA, userId, null, "no-key-repo");

    try {
      await expect(
        threadsService.create(orgA, userId, { projectId: project.id, runtimeId: CLOUD_RUNTIME_ID }),
      ).rejects.toThrow(CLOUD_OFF);
    } finally {
      process.env.AVEN_BOAT_API_KEY = "boat_test_key_for_cloud";
    }
  });

  test("with the provider off Aven Cloud is hidden, refuses new threads and cannot wake the ones it has", async () => {
    const { project } = await seedProject(orgA, userId, null, "off-repo");
    const mine = await threadsService.create(orgA, userId, {
      projectId: project.id,
      runtimeId: CLOUD_RUNTIME_ID,
    });
    process.env.AVEN_CLOUD_PROVIDER = "off";

    try {
      const listed = (await runtimesService.list(orgA, userId)).map(({ id }) => id);
      expect(listed).not.toContain(CLOUD_RUNTIME_ID);
      expect(listed).toContain(mine.runtimeId);
      await expect(
        threadsService.create(orgA, userId, { projectId: project.id, runtimeId: CLOUD_RUNTIME_ID }),
      ).rejects.toThrow(CLOUD_OFF);
      expect(await runtimesService.boatRecord(mine.runtimeId)).toBeNull();
      await expect(
        reachRunner({ get: () => undefined }, { runtimeId: mine.runtimeId }),
      ).rejects.toThrow(CLOUD_OFF);
    } finally {
      process.env.AVEN_CLOUD_PROVIDER = "boat";
    }

    expect(await runtimesService.boatRecord(mine.runtimeId)).not.toBeNull();
  });

  test("the provider is off unless it is named, and a name that is not a provider is refused", () => {
    expect(cloudProvider(undefined)).toBe("off");
    expect(cloudProvider("")).toBe("off");
    expect(cloudProvider(" boat ")).toBe("boat");
    expect(() => cloudProvider("vercel")).toThrow('must be off or boat, got "vercel"');
  });
});
