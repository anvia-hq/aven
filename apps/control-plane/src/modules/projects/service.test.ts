import { afterAll, describe, expect, test } from "bun:test";

import { runtimesService } from "../runtimes/service";
import { projectsService, RuntimeNotFoundError } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("projectsService (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const runnerA = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const runnerB = (await runtimesService.create(orgB, userId, { name: "b" })).runtime;

  afterAll(() => cleanup());

  test("a project is a name and a runner, and is listed", async () => {
    const project = await projectsService.create(orgA, userId, {
      name: "proj",
      runtimeId: runnerA.id,
    });
    expect(project.runtimeId).toBe(runnerA.id);
    expect(project).not.toHaveProperty("projectPath");
    expect((await projectsService.list(orgA)).map((row) => row.id)).toContain(project.id);
  });

  test("two projects can share a name and a runner", async () => {
    const first = await projectsService.create(orgA, userId, {
      name: "same",
      runtimeId: runnerA.id,
    });
    const second = await projectsService.create(orgA, userId, {
      name: "same",
      runtimeId: runnerA.id,
    });
    expect(second.id).not.toBe(first.id);
  });

  test("another organization cannot see or read the project", async () => {
    const project = await projectsService.create(orgA, userId, {
      name: "other",
      runtimeId: runnerA.id,
    });
    expect(await projectsService.get(orgB, project.id)).toBeNull();
    expect((await projectsService.list(orgB)).map((row) => row.id)).not.toContain(project.id);
  });

  test("the runner must belong to the organization and not be revoked", async () => {
    const before = (await projectsService.list(orgA)).length;
    await expect(
      projectsService.create(orgA, userId, { name: "x", runtimeId: runnerB.id }),
    ).rejects.toBeInstanceOf(RuntimeNotFoundError);
    await expect(
      projectsService.create(orgA, userId, { name: "x", runtimeId: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(RuntimeNotFoundError);

    const gone = (await runtimesService.create(orgA, userId, { name: "gone" })).runtime;
    await runtimesService.revoke(orgA, userId, gone.id);
    await expect(
      projectsService.create(orgA, userId, { name: "x", runtimeId: gone.id }),
    ).rejects.toBeInstanceOf(RuntimeNotFoundError);
    expect((await projectsService.list(orgA)).length).toBe(before);
  });

  test("an offline runner can still be chosen", async () => {
    const project = await projectsService.create(orgA, userId, {
      name: "o",
      runtimeId: runnerA.id,
    });
    expect(project.runtimeId).toBe(runnerA.id);
  });
});
