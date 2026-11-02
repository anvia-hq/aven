import { afterAll, describe, expect, spyOn, test } from "bun:test";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { threads } from "@aven/db/schema/threads";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { ForbiddenError, NotFoundError } from "../../errors";
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

  test("a page of commits is read for the project's own organization only, and says which page it is", async () => {
    const commit = {
      sha: "a1",
      message: "Fix",
      author: "Ada",
      date: "2026-11-01T10:00:00Z",
      parents: ["a0"],
      refs: ["main"],
    };
    const commits = spyOn(githubService, "commits").mockImplementation(async () => ({
      commits: [commit],
      hasMore: true,
    }));
    try {
      const project = (await projectsService.list(orgA))[0]!;

      expect(await projectsService.commits(orgA, project.id, 2)).toEqual({
        commits: [commit],
        hasMore: true,
        page: 2,
      });
      expect(commits).toHaveBeenCalledWith(
        project.githubInstallationId,
        project.repoFullName,
        2,
        project.defaultBranch,
      );

      // Another organization's project is not found, and GitHub is not asked.
      commits.mockClear();
      await expect(projectsService.commits(orgB, project.id, 1)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(commits).not.toHaveBeenCalled();

      // A repository the installation lost is not found either.
      commits.mockImplementation(async () => null);
      await expect(projectsService.commits(orgA, project.id, 1)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    } finally {
      commits.mockRestore();
    }
  });

  test("pull requests and issues are read for the project's own organization only (decision 0092)", async () => {
    const item = {
      number: 3,
      title: "Add a thing",
      url: "https://github.com/acme/web/pull/3",
      author: "ada",
      status: "draft" as const,
      comments: 0,
      updatedAt: "2026-11-01T10:00:00Z",
    };
    const tracked = spyOn(githubService, "tracked").mockImplementation(async () => ({
      items: [item],
      total: 11,
      hasMore: true,
    }));
    try {
      const project = (await projectsService.list(orgA))[0]!;

      expect(await projectsService.tracked(orgA, project.id, "pull", "closed", 2)).toEqual({
        items: [item],
        total: 11,
        hasMore: true,
        page: 2,
      });
      expect(tracked).toHaveBeenCalledWith(
        project.githubInstallationId,
        project.repoFullName,
        "pull",
        "closed",
        2,
      );

      // Another organization's project is not found, and GitHub is not asked.
      tracked.mockClear();
      await expect(
        projectsService.tracked(orgB, project.id, "issue", "open", 1),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(tracked).not.toHaveBeenCalled();

      // A repository the installation lost is not found either.
      tracked.mockImplementation(async () => null);
      await expect(
        projectsService.tracked(orgA, project.id, "issue", "open", 1),
      ).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      tracked.mockRestore();
    }
  });

  test("a project moves to another runner for the threads to come, and the threads it has stay where they began (decision 0093)", async () => {
    const { project } = await seedProject(orgA, userId, runnerA.id, "movable");
    const [thread] = await db
      .insert(threads)
      .values({
        organizationId: orgA,
        projectId: project.id,
        createdBy: userId,
        runtimeId: runnerA.id,
        title: "Old",
      })
      .returning();
    const second = (await runtimesService.create(orgA, userId, { name: "second" })).runtime;

    const moved = await projectsService.update(orgA, userId, project.id, { runtimeId: second.id });

    expect(moved.runtimeId).toBe(second.id);
    expect((await projectsService.get(orgA, project.id))?.runtimeId).toBe(second.id);
    // The thread's workspace and history are on the runner it began on.
    const [kept] = await db.select().from(threads).where(eq(threads.id, thread!.id));
    expect(kept?.runtimeId).toBe(runnerA.id);
  });

  test("only whoever imported the project, an owner or an admin moves it, and to a runner of the workspace that is not revoked", async () => {
    const { project } = await seedProject(orgA, userId, runnerA.id, "guarded");
    const person = (role: string) => {
      const id = `u-${role}-${crypto.randomUUID().slice(0, 8)}`;
      return db
        .insert(users)
        .values({ id, name: role, email: `${id}@aven.test` })
        .then(() =>
          db.insert(members).values({ id: `m-${id}`, organizationId: orgA, userId: id, role }),
        )
        .then(() => id);
    };
    const other = await runtimesService.create(orgA, userId, { name: "other" });
    const move = (who: string, runtimeId: string) =>
      projectsService.update(orgA, who, project.id, { runtimeId });

    // A member who did not import it is refused, and nothing changes.
    const plain = await person("member");
    await expect(move(plain, other.runtime.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await projectsService.get(orgA, project.id))?.runtimeId).toBe(runnerA.id);

    // An admin may, and a role that holds several still counts.
    const admin = await person("admin");
    expect((await move(admin, other.runtime.id)).runtimeId).toBe(other.runtime.id);
    const both = await person("member,owner");
    expect((await move(both, runnerA.id)).runtimeId).toBe(runnerA.id);

    // Another organization's runner, one that does not exist and a revoked one are not runners to
    // move to; another organization's project is not found.
    await expect(move(userId, runnerB.id)).rejects.toBeInstanceOf(RuntimeNotFoundError);
    await expect(move(userId, crypto.randomUUID())).rejects.toBeInstanceOf(RuntimeNotFoundError);
    await runtimesService.revoke(orgA, userId, other.runtime.id);
    await expect(move(userId, other.runtime.id)).rejects.toBeInstanceOf(RuntimeNotFoundError);
    expect((await projectsService.get(orgA, project.id))?.runtimeId).toBe(runnerA.id);
    await expect(
      projectsService.update(orgB, userId, project.id, { runtimeId: runnerB.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
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
