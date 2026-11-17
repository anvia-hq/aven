import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { projectEnvironments } from "@aven/db/schema/project-environments";
import { runtimes } from "@aven/db/schema/runtimes";
import { eq } from "drizzle-orm";

import { threadsService } from "../threads/service";
import { CLOUD_RUNTIME_ID, runtimesService } from "./service";
import { environmentName } from "../environments/service";
import { setSandboxSettings } from "@aven/sandbox/settings";
import { clearSandboxPlatform } from "../../testing/sandbox-platform";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a new Aven Cloud computer and its project's environment (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const [kept] = await db.select().from(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

  beforeAll(async () => {
    setSandboxSettings({
      provider: "boat",
      base: "http://127.0.0.1:9/api/v1",
      apiKey: "boat_test_key_for_environments",
      runnerUrl: "",
    });
    await runtimesService.ensureCloud();
  });

  afterAll(async () => {
    await db.delete(projectEnvironments).where(eq(projectEnvironments.organizationId, orgA));
    await cleanup();

    if (!kept) await db.delete(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

    clearSandboxPlatform();
  });

  async function saved(projectId: string, hours: number) {
    await db.insert(projectEnvironments).values({
      organizationId: orgA,
      projectId,
      provider: "boat",
      name: environmentName(projectId),
      setupDigest: "a".repeat(64),
      status: "ready",
      savedAt: new Date(Date.now() - 3_600_000),
      expiresAt: new Date(Date.now() + hours * 3_600_000),
    });
  }

  test("a thread of a project with a saved environment starts its sandbox from it", async () => {
    const { project } = await seedProject(orgA, userId, null, "with-environment");
    await saved(project.id, 24);

    const thread = await threadsService.create(orgA, userId, {
      projectId: project.id,
      runtimeId: CLOUD_RUNTIME_ID,
    });

    const record = await runtimesService.cloudRecord(thread.runtimeId, "boat");
    expect(record?.environment).toBe(environmentName(project.id));
  });

  test("an environment past its expiry is not used, and the sandbox is made without one", async () => {
    const { project } = await seedProject(orgA, userId, null, "expired-environment");
    await saved(project.id, -1);

    const thread = await threadsService.create(orgA, userId, {
      projectId: project.id,
      runtimeId: CLOUD_RUNTIME_ID,
    });

    const record = await runtimesService.cloudRecord(thread.runtimeId, "boat");
    expect(record?.environment).toBeNull();
  });
});
