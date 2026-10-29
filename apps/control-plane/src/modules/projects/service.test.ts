import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InvalidProjectPathError } from "@aven/agents/workspace";
import { startRuntime } from "@aven/runtime-client/runner";
import { Elysia } from "elysia";

import { connectRouter } from "../runtimes/connect";
import { runtimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import { DuplicateProjectPathError, projectsService, RuntimeNotFoundError } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("projectsService (postgres)", async () => {
  const { seedOrgPair } = await import("../../test-support");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const dir = await mkdtemp(join(tmpdir(), "aven-projects-"));

  afterAll(async () => {
    await cleanup();
    await rm(dir, { recursive: true });
  });

  test("creates a project and lists it", async () => {
    const project = await projectsService.create(orgA, userId, { name: "proj", projectPath: dir });
    expect(project.projectPath).toBe(await realpath(dir));
    expect((await projectsService.list(orgA)).map((row) => row.id)).toContain(project.id);
  });

  test("another organization cannot see or read the project", async () => {
    const project = await projectsService.create(orgA, userId, {
      name: "other",
      projectPath: await mkdtemp(join(tmpdir(), "aven-projects-")),
    });
    expect(await projectsService.get(orgB, project.id)).toBeNull();
    expect((await projectsService.list(orgB)).map((row) => row.id)).not.toContain(project.id);
  });

  test("rejects an invalid project path without creating a project", async () => {
    const before = (await projectsService.list(orgA)).length;
    await expect(
      projectsService.create(orgA, userId, { name: "nope", projectPath: join(dir, "missing") }),
    ).rejects.toBeInstanceOf(InvalidProjectPathError);
    expect((await projectsService.list(orgA)).length).toBe(before);
  });

  test("rejects a duplicate path within the same organization", async () => {
    const fresh = await mkdtemp(join(tmpdir(), "aven-projects-"));
    await projectsService.create(orgA, userId, { name: "first", projectPath: fresh });
    await expect(
      projectsService.create(orgA, userId, { name: "second", projectPath: fresh }),
    ).rejects.toBeInstanceOf(DuplicateProjectPathError);
    // Another organization can still use the same path.
    await expect(
      projectsService.create(orgB, userId, { name: "first", projectPath: fresh }),
    ).resolves.toBeDefined();
  });

  describe("on a runtime", () => {
    const server = new Elysia().use(connectRouter(runtimeHub)).listen({ port: 0 });
    let runtimeId: string;
    let client: ReturnType<typeof startRuntime>;

    afterAll(async () => {
      await client?.stop();
      await server.stop(true);
    });

    test("the runtime validates paths on its own disk", async () => {
      const { runtime, token } = await runtimesService.create(orgA, userId, { name: "disk" });
      runtimeId = runtime.id;
      client = startRuntime({ url: `ws://localhost:${server.server?.port}/connect`, token });
      await client.ready;
      for (let i = 0; i < 100 && !runtimeHub.isOnline(runtimeId); i++) await Bun.sleep(20);

      const fresh = await mkdtemp(join(tmpdir(), "aven-runtime-project-"));
      const project = await projectsService.create(orgA, userId, {
        name: "remote",
        projectPath: fresh,
        runtimeId,
      });
      expect(project.runtimeId).toBe(runtimeId);
      expect(project.projectPath).toBe(await realpath(fresh));
      // The same path on the control plane is a different project.
      await expect(
        projectsService.create(orgA, userId, { name: "local", projectPath: fresh }),
      ).resolves.toMatchObject({ runtimeId: null });
      await expect(
        projectsService.create(orgA, userId, { name: "again", projectPath: fresh, runtimeId }),
      ).rejects.toBeInstanceOf(DuplicateProjectPathError);
      // A bad path is reported the same way as for a local project.
      await expect(
        projectsService.create(orgA, userId, {
          name: "bad",
          projectPath: join(fresh, "missing"),
          runtimeId,
        }),
      ).rejects.toBeInstanceOf(InvalidProjectPathError);
    });

    test("browsing goes through the runtime", async () => {
      const listing = await projectsService.browse(orgA, runtimeId, tmpdir());
      expect(listing.path).toBe(await realpath(tmpdir()));
    });

    test("another organization cannot use the runtime", async () => {
      await expect(projectsService.browse(orgB, runtimeId, tmpdir())).rejects.toBeInstanceOf(
        RuntimeNotFoundError,
      );
    });

    test("an offline runtime is reported, not guessed at", async () => {
      await client.stop();
      for (let i = 0; i < 100 && runtimeHub.isOnline(runtimeId); i++) await Bun.sleep(20);
      await expect(projectsService.browse(orgA, runtimeId, tmpdir())).rejects.toThrow("offline");
    });
  });
});
