import { afterAll, describe, expect, spyOn, test } from "bun:test";

import { NotFoundError } from "../../errors";
import { githubService } from "../github/service";
import { runtimesService } from "../runtimes/service";
import {
  projectsService,
  RepositoryAlreadyImportedError,
  RepositoryNotFoundError,
  RuntimeNotFoundError,
} from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("projectsService (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const runnerA = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const runnerB = (await runtimesService.create(orgB, userId, { name: "b" })).runtime;
  const { installation } = await seedProject(orgA, userId, runnerA.id, "seed");

  // GitHub knows two repositories; any other is not visible to the installation.
  const known: Record<string, string> = { "acme/web": "main", "acme/api": "develop" };
  const repo = spyOn(githubService, "repo").mockImplementation(async (_org, _id, fullName) => {
    const defaultBranch = known[fullName];
    return defaultBranch
      ? {
          id: 1,
          fullName,
          private: true,
          defaultBranch,
          cloneUrl: `https://github.com/${fullName}.git`,
          description: null,
        }
      : null;
  });

  afterAll(async () => {
    repo.mockRestore();
    await cleanup();
  });

  const importInput = (repository: string, runtimeId = runnerA.id) => ({
    installationId: installation.id,
    repository,
    runtimeId,
  });

  test("importing records the repository and its runner, named after the repository", async () => {
    const project = await projectsService.import(orgA, userId, importInput("acme/web"));
    expect(project.name).toBe("web");
    expect(project.repoFullName).toBe("acme/web");
    expect(project.cloneUrl).toBe("https://github.com/acme/web.git");
    expect(project.defaultBranch).toBe("main");
    expect(project.runtimeId).toBe(runnerA.id);
    expect((await projectsService.list(orgA)).map((row) => row.id)).toContain(project.id);
  });

  test("a repository can be imported once per organization", async () => {
    await projectsService.import(orgA, userId, importInput("acme/api"));
    await expect(
      projectsService.import(orgA, userId, importInput("acme/api")),
    ).rejects.toBeInstanceOf(RepositoryAlreadyImportedError);
  });

  test("a repository the installation cannot see is refused", async () => {
    await expect(
      projectsService.import(orgA, userId, importInput("acme/secret")),
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  test("another organization cannot see the project or use the installation", async () => {
    const project = (await projectsService.list(orgA))[0]!;
    expect(await projectsService.get(orgB, project.id)).toBeNull();
    expect((await projectsService.list(orgB)).map((row) => row.id)).not.toContain(project.id);
    expect(await githubService.get(orgB, installation.id)).toBeNull();
  });

  test("a folder and the README are read for the project's own organization only (decision 0082)", async () => {
    const folder = spyOn(githubService, "folder").mockImplementation(async () => [
      { name: "src", path: "src", type: "directory" },
    ]);
    const readme = spyOn(githubService, "readme").mockImplementation(async () => ({
      name: "README.md",
      path: "README.md",
      text: "# Web",
      truncated: false,
    }));
    try {
      const project = (await projectsService.list(orgA))[0]!;

      expect(await projectsService.folder(orgA, project.id, "src")).toEqual({
        entries: [{ name: "src", path: "src", type: "directory" }],
      });
      expect(folder).toHaveBeenCalledWith(
        project.githubInstallationId,
        project.repoFullName,
        "src",
      );
      expect((await projectsService.readme(orgA, project.id)).readme?.text).toBe("# Web");

      // Another organization's project is not found, and GitHub is not asked.
      folder.mockClear();
      await expect(projectsService.folder(orgB, project.id, "")).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(projectsService.readme(orgB, project.id)).rejects.toBeInstanceOf(NotFoundError);
      expect(folder).not.toHaveBeenCalled();

      // A path that is not a folder, or a repository the installation lost, is not found either.
      folder.mockImplementation(async () => null);
      await expect(projectsService.folder(orgA, project.id, "app.ts")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    } finally {
      folder.mockRestore();
      readme.mockRestore();
    }
  });

  test("the runner must belong to the organization and not be revoked", async () => {
    const before = (await projectsService.list(orgA)).length;
    await expect(
      projectsService.import(orgA, userId, importInput("acme/web", runnerB.id)),
    ).rejects.toBeInstanceOf(RuntimeNotFoundError);
    await expect(
      projectsService.import(orgA, userId, importInput("acme/web", crypto.randomUUID())),
    ).rejects.toBeInstanceOf(RuntimeNotFoundError);

    const gone = (await runtimesService.create(orgA, userId, { name: "gone" })).runtime;
    await runtimesService.revoke(orgA, userId, gone.id);
    await expect(
      projectsService.import(orgA, userId, importInput("acme/web", gone.id)),
    ).rejects.toBeInstanceOf(RuntimeNotFoundError);
    expect((await projectsService.list(orgA)).length).toBe(before);
  });
});
