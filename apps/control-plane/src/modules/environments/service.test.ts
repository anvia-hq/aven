import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { projectEnvironments } from "@aven/db/schema/project-environments";
import { eq } from "drizzle-orm";

import { createEnvironmentsService, ENVIRONMENT_TTL_MS, environmentName } from "./service";
import type { EnvironmentProvider } from "./types";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const HOUR_MS = 3_600_000;

run("a project's environment (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const { project } = await seedProject(orgA, userId, null, "env-project");

  afterAll(cleanup);

  function serviceGoingThrough(options: {
    save?: "saving" | "ready" | "failed";
    read?: EnvironmentProvider["readEnvironment"];
    removed?: boolean;
  }) {
    const calls: string[] = [];
    const provider: EnvironmentProvider = {
      async saveEnvironment(sandboxId, name) {
        calls.push(`save ${sandboxId} ${name}`);
        return {
          name,
          status: options.save ?? "saving",
          error: options.save === "failed" ? "disk full" : null,
        };
      },
      readEnvironment: async (name) => {
        calls.push(`read ${name}`);

        if (options.read) return options.read(name);

        return { name, status: "ready", error: null };
      },
      async removeEnvironment(name) {
        calls.push(`remove ${name}`);
        return options.removed ?? true;
      },
    };
    return { service: createEnvironmentsService(() => provider), calls };
  }

  const rowOf = async () =>
    (
      await db
        .select()
        .from(projectEnvironments)
        .where(eq(projectEnvironments.projectId, project.id))
    ).at(0);

  const clear = () =>
    db.delete(projectEnvironments).where(eq(projectEnvironments.projectId, project.id));

  test("saves under the project's own name, and reads it back as ready for 72 hours", async () => {
    await clear();
    const { service, calls } = serviceGoingThrough({});

    const started = await service.start({
      organizationId: orgA,
      projectId: project.id,
      provider: "boat",
      sandboxId: "bx_23456789",
      setupDigest: "a".repeat(64),
    });

    expect(started).toMatchObject({ status: "saving", savedAt: null, expiresAt: null });
    expect(calls).toEqual([`save bx_23456789 ${environmentName(project.id)}`]);

    const ready = await service.ready(project.id, "boat");
    expect(ready?.status).toBe("ready");
    expect(ready?.setupDigest).toBe("a".repeat(64));
    expect(calls).toEqual([
      `save bx_23456789 ${environmentName(project.id)}`,
      `read ${environmentName(project.id)}`,
    ]);
    const expiresAt = ready?.expiresAt?.getTime() ?? 0;
    expect(expiresAt - Date.now()).toBeGreaterThan(ENVIRONMENT_TTL_MS - 60_000);
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(ENVIRONMENT_TTL_MS);
  });

  test("a save that failed is kept as failed, and no thread starts from it", async () => {
    await clear();
    const { service } = serviceGoingThrough({ save: "failed" });

    await service.start({
      organizationId: orgA,
      projectId: project.id,
      provider: "spaces",
      sandboxId: "bx_23456789",
      setupDigest: "b".repeat(64),
    });

    expect(await service.view(project.id, "spaces")).toMatchObject({
      status: "failed",
    });
    expect((await rowOf())?.error).toBe("disk full");
    expect(await service.ready(project.id, "spaces")).toBeNull();
  });

  test("a snapshot the provider no longer has is failed rather than trusted", async () => {
    await clear();
    const { service } = serviceGoingThrough({ read: async () => null });

    await service.start({
      organizationId: orgA,
      projectId: project.id,
      provider: "boat",
      sandboxId: "bx_23456789",
      setupDigest: "c".repeat(64),
    });

    expect(await service.ready(project.id, "boat")).toBeNull();
    expect((await rowOf())?.status).toBe("failed");
    expect((await rowOf())?.error).toBe("The saved environment is gone");
  });

  test("an environment past 72 hours is deleted at the provider and forgotten", async () => {
    await clear();
    const { service, calls } = serviceGoingThrough({});

    await service.start({
      organizationId: orgA,
      projectId: project.id,
      provider: "boat",
      sandboxId: "bx_23456789",
      setupDigest: "d".repeat(64),
    });

    await db
      .update(projectEnvironments)
      .set({
        status: "ready",
        savedAt: new Date(Date.now() - 73 * HOUR_MS),
        expiresAt: new Date(Date.now() - HOUR_MS),
      })
      .where(eq(projectEnvironments.projectId, project.id));

    expect(await service.ready(project.id, "boat")).toBeNull();
    expect(calls).toContain(`remove ${environmentName(project.id)}`);
    expect(await rowOf()).toBeUndefined();
  });

  test("a removal the provider refuses keeps the row so the sweep tries again", async () => {
    await clear();
    const { service } = serviceGoingThrough({ removed: false });

    await service.start({
      organizationId: orgA,
      projectId: project.id,
      provider: "boat",
      sandboxId: "bx_23456789",
      setupDigest: "e".repeat(64),
    });

    await db
      .update(projectEnvironments)
      .set({ status: "ready", expiresAt: new Date(Date.now() - HOUR_MS) })
      .where(eq(projectEnvironments.projectId, project.id));

    const [stale] = await service.expired(new Date());
    expect(await service.forget(stale!)).toBe(false);
    expect(await rowOf()).toBeDefined();
  });

  test("only an Aven Cloud computer with a sandbox keeps an environment", async () => {
    await clear();
    const { service, calls } = serviceGoingThrough({});

    await expect(
      service.start({
        organizationId: orgA,
        projectId: project.id,
        provider: "manual",
        sandboxId: "bx_23456789",
        setupDigest: "f".repeat(64),
      }),
    ).rejects.toThrow("Only an Aven Cloud computer can keep an environment");

    await expect(
      service.start({
        organizationId: orgA,
        projectId: project.id,
        provider: "boat",
        sandboxId: null,
        setupDigest: "f".repeat(64),
      }),
    ).rejects.toThrow("has not started yet");
    expect(calls).toEqual([]);
  });
});
