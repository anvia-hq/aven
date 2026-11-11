import { afterAll, describe, expect, spyOn, test } from "bun:test";

import { db } from "@aven/db/client";
import { environmentVariables } from "@aven/db/schema/environment-variables";
import { members } from "@aven/db/schema/members";
import { threads } from "@aven/db/schema/threads";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { githubService } from "../github/service";
import { runtimesService } from "../runtimes/service";
import { createThreadMessages } from "../threads/messages";
import { threadsService } from "../threads/service";
import {
  FolderNotServedError,
  projectsService,
  RepositoryAlreadyImportedError,
  RepositoryNotFoundError,
  RuntimeNotFoundError,
} from "./service";
import type { ProjectFolders } from "./types";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const noFolders: ProjectFolders = {
  files: async () => {
    throw new Error("A GitHub project does not ask a runner for its files");
  },
  readme: async () => {
    throw new Error("A GitHub project does not ask a runner for its README");
  },
};

run("projectsService (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, orgB, cleanup } = await seedOrgPair();
  const runnerA = (await runtimesService.create(orgA, userId, { name: "a" })).runtime;
  const runnerB = (await runtimesService.create(orgB, userId, { name: "b" })).runtime;
  const { installation } = await seedProject(orgA, userId, runnerA.id, "seed");

  const known: Record<string, string> = {
    "acme/web": "main",
    "acme/api": "develop",
    "acme/web-again": "main",
  };
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

  test("a project can be a folder that its runner serves", async () => {
    const { runtime } = await runtimesService.create(orgA, userId, { name: "my mac" });
    await runtimesService.setDirectories(runtime.id, ["/home/me/code"]);

    const project = await projectsService.addFolder(orgA, userId, {
      runtimeId: runtime.id,
      path: "/home/me/code/aven/",
    });

    expect(project).toMatchObject({
      directory: "/home/me/code/aven",
      name: "aven",
      githubInstallationId: null,
      repoFullName: null,
    });
    await expect(
      projectsService.addFolder(orgA, userId, {
        runtimeId: runtime.id,
        path: "/home/me/code/aven",
      }),
    ).rejects.toBeInstanceOf(RepositoryAlreadyImportedError);
    await expect(
      projectsService.addFolder(orgA, userId, { runtimeId: runtime.id, path: "/home/me/other" }),
    ).rejects.toBeInstanceOf(FolderNotServedError);
    await expect(
      projectsService.addFolder(orgA, userId, {
        runtimeId: runtime.id,
        path: "/home/me/code/../x",
      }),
    ).rejects.toBeInstanceOf(FolderNotServedError);
    await expect(
      projectsService.addFolder(orgA, userId, { runtimeId: runtime.id, path: "relative/dir" }),
    ).rejects.toBeInstanceOf(FolderNotServedError);
    const thread = await threadsService.create(orgA, userId, { projectId: project.id });
    expect(await projectsService.folderOf(thread.id)).toBe("/home/me/code/aven");
    await expect(projectsService.repoAccess(thread.id)).rejects.toThrow("folder on a computer");
    await expect(projectsService.branches(orgA, project.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  test("a folder project's files and README come from its runner, for a person who may use that computer", async () => {
    const { runtime } = await runtimesService.create(orgA, userId, { name: "files mac" });
    await runtimesService.setHost(runtime.id, true);
    await runtimesService.setDirectories(runtime.id, ["/home/me/work"]);
    const project = await projectsService.addFolder(orgA, userId, {
      runtimeId: runtime.id,
      path: "/home/me/work/site",
    });
    const asked: unknown[] = [];
    const folders: ProjectFolders = {
      files: async (runtimeId, folder, path) => {
        asked.push([runtimeId, folder, path]);
        return { entries: [{ name: "src", path: "src", type: "directory" }] };
      },
      readme: async (runtimeId, folder) => {
        asked.push([runtimeId, folder]);
        return { readme: null };
      },
    };

    expect(await projectsService.folder(orgA, userId, project.id, "src", folders)).toEqual({
      entries: [{ name: "src", path: "src", type: "directory" }],
    });
    expect(await projectsService.readme(orgA, userId, project.id, folders)).toEqual({
      readme: null,
    });
    expect(asked).toEqual([
      [runtime.id, "/home/me/work/site", "src"],
      [runtime.id, "/home/me/work/site"],
    ]);
    const stranger = await personIn(orgA, "member");
    await expect(
      projectsService.folder(orgA, stranger, project.id, "", folders),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      projectsService.readme(orgA, stranger, project.id, folders),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  test("a runner's folders cannot be used through another person's private computer", async () => {
    const { runtime } = await runtimesService.create(orgA, userId, { name: "private mac" });
    await runtimesService.setHost(runtime.id, true);
    await runtimesService.setDirectories(runtime.id, ["/srv/code"]);

    await expect(
      projectsService.addFolder(orgA, "someone-else", {
        runtimeId: runtime.id,
        path: "/srv/code/x",
      }),
    ).rejects.toBeInstanceOf(RuntimeNotFoundError);
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
      tags: [],
      authorAvatar: null,
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
        undefined,
      );

      commits.mockClear();
      await expect(projectsService.commits(orgB, project.id, 1)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(commits).not.toHaveBeenCalled();

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
      labels: [],
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
        undefined,
      );

      tracked.mockClear();
      await expect(
        projectsService.tracked(orgB, project.id, "issue", "open", 1),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(tracked).not.toHaveBeenCalled();

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

    const plain = await person("member");
    await expect(move(plain, other.runtime.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await projectsService.get(orgA, project.id))?.runtimeId).toBe(runnerA.id);

    const admin = await person("admin");
    expect((await move(admin, other.runtime.id)).runtimeId).toBe(other.runtime.id);
    const both = await person("member,owner");
    expect((await move(both, runnerA.id)).runtimeId).toBe(runnerA.id);

    await expect(move(userId, runnerB.id)).rejects.toBeInstanceOf(RuntimeNotFoundError);
    await expect(move(userId, crypto.randomUUID())).rejects.toBeInstanceOf(RuntimeNotFoundError);
    await runtimesService.revoke(orgA, userId, other.runtime.id);
    await expect(move(userId, other.runtime.id)).rejects.toBeInstanceOf(RuntimeNotFoundError);
    expect((await projectsService.get(orgA, project.id))?.runtimeId).toBe(runnerA.id);
    await expect(
      projectsService.update(orgB, userId, project.id, { runtimeId: runnerB.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  const personIn = async (organizationId: string, role: string) => {
    const id = `u-${role.replace(/\W/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
    await db.insert(users).values({ id, name: role, email: `${id}@aven.test` });
    await db.insert(members).values({ id: `m-${id}`, organizationId, userId: id, role });
    return id;
  };

  test("deleting a project hides it and keeps its threads, archived, and wipes its variables (decision 0094)", async () => {
    const { project } = await seedProject(orgA, userId, runnerA.id, "doomed");
    const [open, archived] = await db
      .insert(threads)
      .values(
        ["open", "archived"].map((state) => ({
          organizationId: orgA,
          projectId: project.id,
          createdBy: userId,
          runtimeId: runnerA.id,
          title: state,
          state: state as "open" | "archived",
        })),
      )
      .returning();
    await db.insert(environmentVariables).values({
      organizationId: orgA,
      projectId: project.id,
      name: "SECRET_KEY",
      valueEncrypted: "iv.tag.data",
      secret: true,
    });
    const cancelled: string[] = [];

    await projectsService.remove(orgA, userId, project.id, (thread) => cancelled.push(thread.id));

    expect(await projectsService.get(orgA, project.id)).toBeNull();
    expect((await projectsService.list(orgA)).map((row) => row.id)).not.toContain(project.id);
    expect((await projectsService.listForPerson(userId)).map((row) => row.id)).not.toContain(
      project.id,
    );
    await expect(
      projectsService.update(orgA, userId, project.id, { runtimeId: runnerA.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      projectsService.folder(orgA, userId, project.id, "", noFolders),
    ).rejects.toBeInstanceOf(NotFoundError);
    const kept = await db.select().from(threads).where(eq(threads.projectId, project.id));
    expect(kept.map((thread) => [thread.title, thread.state]).sort()).toEqual([
      ["archived", "archived"],
      ["open", "archived"],
    ]);
    expect(cancelled.sort()).toEqual([open!.id, archived!.id].sort());
    expect(
      await db
        .select()
        .from(environmentVariables)
        .where(eq(environmentVariables.projectId, project.id)),
    ).toEqual([]);
    await expect(
      createThreadMessages({ isRunning: () => false, start: async () => {} } as never).send(
        orgA,
        userId,
        open!.id,
        {
          prompt: "hello",
        },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(projectsService.repoAccess(open!.id)).rejects.toThrow("project was deleted");
    const viewer = { organizationId: orgA, userId };
    await expect(threadsService.update(viewer, open!.id, { state: "open" })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await threadsService.update(viewer, open!.id, { state: "archived" }))?.state).toBe(
      "archived",
    );
    expect((await threadsService.update(viewer, open!.id, { title: "Renamed" }))?.title).toBe(
      "Renamed",
    );
  });

  test("a deleted project lets its repository be imported again, as a project of its own", async () => {
    const first = await projectsService.import(orgA, userId, importInput("acme/web-again"));
    await expect(
      projectsService.import(orgA, userId, importInput("acme/web-again")),
    ).rejects.toBeInstanceOf(RepositoryAlreadyImportedError);
    await projectsService.remove(orgA, userId, first.id, () => {});

    const again = await projectsService.import(orgA, userId, importInput("acme/web-again"));

    expect(again.id).not.toBe(first.id);
    expect(
      (await projectsService.list(orgA)).filter((row) => row.repoFullName === "acme/web-again"),
    ).toHaveLength(1);
  });

  test("only whoever imported the project, an owner or an admin deletes it, and another workspace cannot", async () => {
    const { project } = await seedProject(orgA, userId, runnerA.id, "protected");
    const plain = await personIn(orgA, "member");
    const cancel = () => {};

    await expect(projectsService.remove(orgA, plain, project.id, cancel)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(projectsService.remove(orgB, userId, project.id, cancel)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await projectsService.get(orgA, project.id)).not.toBeNull();

    await projectsService.remove(orgA, await personIn(orgA, "admin"), project.id, cancel);
    expect(await projectsService.get(orgA, project.id)).toBeNull();
    await expect(projectsService.remove(orgA, userId, project.id, cancel)).rejects.toBeInstanceOf(
      NotFoundError,
    );
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

      expect(await projectsService.folder(orgA, userId, project.id, "src", noFolders)).toEqual({
        entries: [{ name: "src", path: "src", type: "directory" }],
      });
      expect(folder).toHaveBeenCalledWith(
        project.githubInstallationId,
        project.repoFullName,
        "src",
      );
      expect((await projectsService.readme(orgA, userId, project.id, noFolders)).readme?.text).toBe(
        "# Web",
      );

      folder.mockClear();
      await expect(
        projectsService.folder(orgB, userId, project.id, "", noFolders),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        projectsService.readme(orgB, userId, project.id, noFolders),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(folder).not.toHaveBeenCalled();

      folder.mockImplementation(async () => null);
      await expect(
        projectsService.folder(orgA, userId, project.id, "app.ts", noFolders),
      ).rejects.toBeInstanceOf(NotFoundError);
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
