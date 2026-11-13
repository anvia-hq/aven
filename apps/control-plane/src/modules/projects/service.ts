import { db } from "@aven/db/client";
import { environmentVariables } from "@aven/db/schema/environment-variables";
import { memoryNotes } from "@aven/db/schema/memory-notes";
import { members } from "@aven/db/schema/members";
import { projects } from "@aven/db/schema/projects";
import { threads } from "@aven/db/schema/threads";
import { basename, isAbsolute, normalize, sep } from "node:path";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  orNotFound,
  UnprocessableError,
} from "@aven/server-kit/errors";
import { isOwnerOrAdmin } from "../auth/members";
import { githubService } from "../github/service";
import { runtimesService } from "../runtimes/service";
import type { AddFolderBody, AddRepositoryBody, UpdateProjectBody } from "./schema";
import type { ProjectFolders } from "./types";
import type {
  GithubCommitFilters,
  GithubTrackedFilters,
  GithubTrackedKind,
  GithubTrackedState,
} from "@aven/github/types";

export class RuntimeNotFoundError extends UnprocessableError {}
export class RepositoryAlreadyImportedError extends ConflictError {}
export class FolderNotServedError extends UnprocessableError {}

const insideServed = (served: readonly string[], path: string) =>
  served.some((dir) => path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep));

type GithubProject = {
  githubInstallationId: string | null;
  repoFullName: string | null;
  defaultBranch: string | null;
};

function githubOf(project: GithubProject) {
  if (!project.githubInstallationId || !project.repoFullName) {
    throw new NotFoundError("This project is a folder on a computer, not a GitHub repository");
  }

  return {
    installationId: project.githubInstallationId,
    repo: project.repoFullName,
    branch: project.defaultBranch ?? "main",
  };
}

export const projectsService = {
  list: (organizationId: string) =>
    db
      .select()
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt)))
      .orderBy(desc(projects.updatedAt)),

  async get(organizationId: string, id: string) {
    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, organizationId),
          eq(projects.id, id),
          isNull(projects.deletedAt),
        ),
      );
    return project ?? null;
  },

  listForPerson: (userId: string) =>
    db
      .select()
      .from(projects)
      .where(
        and(
          inArray(
            projects.organizationId,
            db
              .select({ id: members.organizationId })
              .from(members)
              .where(eq(members.userId, userId)),
          ),
          isNull(projects.deletedAt),
        ),
      )
      .orderBy(desc(projects.updatedAt)),

  async addFolder(organizationId: string, userId: string, body: AddFolderBody) {
    const runtime = await runtimesService.get(organizationId, body.runtimeId, userId);

    if (!runtime) throw new RuntimeNotFoundError("Runner not found");

    const path = normalize(body.path).replace(/[\\/]+$/, "") || sep;

    if (!isAbsolute(path)) throw new FolderNotServedError("Give the folder as an absolute path");

    if (!insideServed(runtime.directories, path)) {
      throw new FolderNotServedError(
        runtime.directories.length === 0
          ? `${runtime.name} serves no folders: start its runner with --dir <folder>`
          : `${runtime.name} does not serve that folder. It serves: ${runtime.directories.join(", ")}`,
      );
    }

    const [project] = await db
      .insert(projects)
      .values({
        organizationId,
        createdBy: userId,
        runtimeId: runtime.id,
        directory: path,
        name: body.name ?? (basename(path) || path),
      })
      .onConflictDoNothing()
      .returning();

    if (!project) throw new RepositoryAlreadyImportedError("This folder is already a project");

    return project;
  },

  async addRepository(
    organizationId: string,
    userId: string,
    body: AddRepositoryBody,
    folders: Pick<ProjectFolders, "clone">,
  ) {
    if (!(await runtimesService.get(organizationId, body.runtimeId, userId))) {
      throw new RuntimeNotFoundError("Runner not found");
    }

    const { path } = await folders.clone(body.runtimeId, body.repository);
    return projectsService.addFolder(organizationId, userId, {
      runtimeId: body.runtimeId,
      path,
      name: body.name,
    });
  },

  async requireManager(organizationId: string, userId: string, project: { createdBy: string }) {
    if (project.createdBy === userId || (await isOwnerOrAdmin(organizationId, userId))) return;

    throw new ForbiddenError(
      "Only the person who imported the project, an owner or an admin can do that",
    );
  },

  async update(organizationId: string, userId: string, id: string, body: UpdateProjectBody) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    await projectsService.requireManager(organizationId, userId, project);

    if (!(await runtimesService.get(organizationId, body.runtimeId, userId))) {
      throw new RuntimeNotFoundError("Runner not found");
    }

    const [updated] = await db
      .update(projects)
      .set({ runtimeId: body.runtimeId })
      .where(eq(projects.id, project.id))
      .returning();
    return updated!;
  },

  async remove(
    organizationId: string,
    userId: string,
    id: string,
    putAway: (thread: { id: string; runtimeId: string }) => unknown,
  ) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    await projectsService.requireManager(organizationId, userId, project);
    const archivedThreads = await db.transaction(async (tx) => {
      await tx.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, project.id));
      await tx.delete(environmentVariables).where(eq(environmentVariables.projectId, project.id));
      await tx.delete(memoryNotes).where(eq(memoryNotes.projectId, project.id));
      return tx
        .update(threads)
        .set({ state: "archived" })
        .where(eq(threads.projectId, project.id))
        .returning({ id: threads.id, runtimeId: threads.runtimeId });
    });
    for (const thread of archivedThreads) putAway(thread);
  },

  async folderRunner(
    organizationId: string,
    userId: string,
    project: { runtimeId: string; directory: string | null },
  ) {
    if (!(await runtimesService.get(organizationId, project.runtimeId, userId))) {
      throw new ForbiddenError("This project is on a computer that is private to its owner");
    }

    return { runtimeId: project.runtimeId, directory: project.directory! };
  },

  async folder(
    organizationId: string,
    userId: string,
    id: string,
    path: string,
    folders: ProjectFolders,
  ) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");

    if (project.directory) {
      const { runtimeId, directory } = await projectsService.folderRunner(
        organizationId,
        userId,
        project,
      );
      return folders.files(runtimeId, directory, path);
    }

    const github = githubOf(project);
    const entries = await githubService.folder(github.installationId, github.repo, path);
    return { entries: orNotFound(entries, "Folder not found") };
  },

  async readme(organizationId: string, userId: string, id: string, folders: ProjectFolders) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");

    if (project.directory) {
      const { runtimeId, directory } = await projectsService.folderRunner(
        organizationId,
        userId,
        project,
      );
      return folders.readme(runtimeId, directory);
    }

    if (!project.githubInstallationId || !project.repoFullName) return { readme: null };

    return {
      readme: await githubService.readme(project.githubInstallationId, project.repoFullName),
    };
  },

  async commits(
    organizationId: string,
    userId: string,
    id: string,
    page: number,
    folders: ProjectFolders,
    filters?: GithubCommitFilters,
  ) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");

    if (project.directory) {
      const { runtimeId, directory } = await projectsService.folderRunner(
        organizationId,
        userId,
        project,
      );
      return { ...(await folders.commits(runtimeId, directory, page)), page };
    }

    const github = githubOf(project);
    const found = await githubService.commits(
      github.installationId,
      github.repo,
      page,
      github.branch,
      filters,
    );
    return { ...orNotFound(found, "Repository not found"), page };
  },

  async tracked(
    organizationId: string,
    id: string,
    kind: GithubTrackedKind,
    state: GithubTrackedState,
    page: number,
    filters?: GithubTrackedFilters,
  ) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    const github = githubOf(project);
    const found = await githubService.tracked(
      github.installationId,
      github.repo,
      kind,
      state,
      page,
      filters,
    );
    return { ...orNotFound(found, "Repository not found"), page };
  },

  async pull(organizationId: string, id: string, number: number) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    const github = githubOf(project);
    return orNotFound(
      await githubService.pull(github.installationId, github.repo, number),
      "Pull request not found",
    );
  },

  async branches(organizationId: string, id: string) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    const github = githubOf(project);
    const found = await githubService.branches(github.installationId, github.repo, github.branch);
    return orNotFound(found, "Repository not found");
  },

  async commit(organizationId: string, id: string, sha: string) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    const github = githubOf(project);
    return orNotFound(
      await githubService.commit(github.installationId, github.repo, sha),
      "Commit not found",
    );
  },

  async folderOf(threadId: string) {
    const [row] = await db
      .select({ directory: projects.directory })
      .from(threads)
      .innerJoin(projects, eq(projects.id, threads.projectId))
      .where(eq(threads.id, threadId));
    return row?.directory ?? null;
  },

  async repoAccess(threadId: string) {
    const [row] = await db
      .select({
        cloneUrl: projects.cloneUrl,
        defaultBranch: projects.defaultBranch,
        githubInstallationId: projects.githubInstallationId,
        deletedAt: projects.deletedAt,
      })
      .from(threads)
      .innerJoin(projects, eq(projects.id, threads.projectId))
      .where(eq(threads.id, threadId));

    if (!row) throw new Error("Unknown thread");

    if (row.deletedAt) throw new Error("The thread's project was deleted");

    if (!row.cloneUrl || !row.defaultBranch || !row.githubInstallationId) {
      throw new Error("The thread's project is a folder on a computer, not a repository to clone");
    }

    return {
      cloneUrl: row.cloneUrl,
      defaultBranch: row.defaultBranch,
      token: await githubService.cloneToken(row.githubInstallationId),
    };
  },
};
