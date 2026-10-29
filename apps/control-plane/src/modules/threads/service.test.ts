import { afterAll, describe, expect, test } from "bun:test";

import { runtimesService } from "../runtimes/service";
import { ProjectHasNoRunnerError, ProjectNotFoundError, threadsService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("threadsService (postgres)", async () => {
  const { projectsService } = await import("../projects/service");
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const runnerA = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const runnerB = (await runtimesService.create(orgB, userId, { name: "b" })).runtime;
  const projectA = await projectsService.create(orgA, userId, {
    name: "proj",
    runtimeId: runnerA.id,
  });
  const projectB = await projectsService.create(orgB, userId, {
    name: "proj-b",
    runtimeId: runnerB.id,
  });

  afterAll(() => cleanup());

  test("creates a thread titled after the project and lists it", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    expect(thread.title).toBe("proj");
    expect(thread.projectId).toBe(projectA.id);
    expect(thread.runtimeId).toBe(runnerA.id);
    expect(thread).not.toHaveProperty("projectPath");
    expect((await threadsService.list(orgA)).map((row) => row.id)).toContain(thread.id);
  });

  test("another organization cannot see, read or change the thread", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    expect(await threadsService.get(orgB, thread.id)).toBeNull();
    expect(await threadsService.update(orgB, thread.id, { title: "hijack" })).toBeNull();
    expect((await threadsService.list(orgB)).map((row) => row.id)).not.toContain(thread.id);
    expect((await threadsService.get(orgA, thread.id))?.title).not.toBe("hijack");
  });

  test("rejects a project belonging to another organization", async () => {
    const before = (await threadsService.list(orgA)).length;
    await expect(
      threadsService.create(orgA, userId, { projectId: projectB.id }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect((await threadsService.list(orgA)).length).toBe(before);
  });

  test("a project from before sandboxes has no runner and cannot start a thread", async () => {
    const { db } = await import("@aven/db/client");
    const { projects } = await import("@aven/db/schema/projects");
    const [legacy] = await db
      .insert(projects)
      .values({ organizationId: orgA, createdBy: userId, name: "legacy", runtimeId: null })
      .returning();
    await expect(
      threadsService.create(orgA, userId, { projectId: legacy!.id }),
    ).rejects.toBeInstanceOf(ProjectHasNoRunnerError);
  });
});
