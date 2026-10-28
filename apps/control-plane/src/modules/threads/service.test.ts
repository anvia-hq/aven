import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProjectNotFoundError, threadsService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("threadsService (postgres)", async () => {
  const { projectsService } = await import("../projects/service");
  const { seedOrgPair } = await import("../../test-support");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const dir = await mkdtemp(join(tmpdir(), "aven-threads-"));
  const projectA = await projectsService.create(orgA, userId, { name: "proj", projectPath: dir });
  const projectB = await projectsService.create(orgB, userId, { name: "proj-b", projectPath: dir });

  afterAll(async () => {
    await cleanup();
    await rm(dir, { recursive: true });
  });

  test("creates a thread titled after the project and lists it", async () => {
    const thread = await threadsService.create(orgA, userId, { projectId: projectA.id });
    expect(thread.title).toBe("proj");
    expect(thread.projectId).toBe(projectA.id);
    expect(thread.projectPath).toBe(await realpath(dir));
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
});
