import { db } from "@aven/db/client";
import { environmentVariables } from "@aven/db/schema/environment-variables";
import { memoryNotes } from "@aven/db/schema/memory-notes";
import { members } from "@aven/db/schema/members";
import { projects } from "@aven/db/schema/projects";
import { threads } from "@aven/db/schema/threads";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { ConflictError, ForbiddenError, orNotFound, UnprocessableError } from "../../errors";
import { isOwnerOrAdmin } from "../auth/members";
import type {
  GithubCommitFilters,
  GithubTrackedFilters,
  GithubTrackedKind,
  GithubTrackedState,
} from "../github/client";
import { githubService } from "../github/service";
import { runtimesService } from "../runtimes/service";
import type { ImportProjectBody, UpdateProjectBody } from "./schema";

export class RuntimeNotFoundError extends UnprocessableError {}
export class RepositoryNotFoundError extends UnprocessableError {}
export class RepositoryAlreadyImportedError extends ConflictError {}

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

  async import(organizationId: string, userId: string, body: ImportProjectBody) {
    if (!(await runtimesService.get(organizationId, body.runtimeId))) {
      throw new RuntimeNotFoundError("Runner not found");
    }
    const repo = await githubService.repo(organizationId, body.installationId, body.repository);
    if (!repo)
      throw new RepositoryNotFoundError("Repository not found on that GitHub installation");
    const [project] = await db
      .insert(projects)
      .values({
        organizationId,
        createdBy: userId,
        runtimeId: body.runtimeId,
        githubInstallationId: body.installationId,
        repoFullName: repo.fullName,
        cloneUrl: repo.cloneUrl,
        defaultBranch: repo.defaultBranch,
        name: body.name ?? repo.fullName.split("/")[1]!,
      })
      .onConflictDoNothing()
      .returning();
    if (!project) throw new RepositoryAlreadyImportedError("This repository is already imported");
    return project;
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
    if (!(await runtimesService.get(organizationId, body.runtimeId))) {
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

  async folder(organizationId: string, id: string, path: string) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    const entries = await githubService.folder(
      project.githubInstallationId,
      project.repoFullName,
      path,
    );
    return { entries: orNotFound(entries, "Folder not found") };
  },

  async readme(organizationId: string, id: string) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    return {
      readme: await githubService.readme(project.githubInstallationId, project.repoFullName),
    };
  },

  async commits(organizationId: string, id: string, page: number, filters?: GithubCommitFilters) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    const found = await githubService.commits(
      project.githubInstallationId,
      project.repoFullName,
      page,
      project.defaultBranch,
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
    const found = await githubService.tracked(
      project.githubInstallationId,
      project.repoFullName,
      kind,
      state,
      page,
      filters,
    );
    return { ...orNotFound(found, "Repository not found"), page };
  },

  async pull(organizationId: string, id: string, number: number) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    return orNotFound(
      await githubService.pull(project.githubInstallationId, project.repoFullName, number),
      "Pull request not found",
    );
  },

  async branches(organizationId: string, id: string) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    const found = await githubService.branches(
      project.githubInstallationId,
      project.repoFullName,
      project.defaultBranch,
    );
    return orNotFound(found, "Repository not found");
  },

  async commit(organizationId: string, id: string, sha: string) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    return orNotFound(
      await githubService.commit(project.githubInstallationId, project.repoFullName, sha),
      "Commit not found",
    );
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
    return {
      cloneUrl: row.cloneUrl,
      defaultBranch: row.defaultBranch,
      token: await githubService.cloneToken(row.githubInstallationId),
    };
  },
};
