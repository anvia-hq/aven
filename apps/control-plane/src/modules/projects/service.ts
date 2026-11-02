import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { projects } from "@aven/db/schema/projects";
import { threads } from "@aven/db/schema/threads";
import { and, desc, eq, inArray } from "drizzle-orm";

import { ConflictError, ForbiddenError, orNotFound, UnprocessableError } from "../../errors";
import { isOwnerOrAdmin } from "../auth/members";
import type { GithubTrackedKind, GithubTrackedState } from "../github/client";
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
      .where(eq(projects.organizationId, organizationId))
      .orderBy(desc(projects.updatedAt)),

  // Every lookup is scoped to the organization: another organization's project is simply not found.
  async get(organizationId: string, id: string) {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), eq(projects.id, id)));
    return project ?? null;
  },

  // The projects of every workspace a person belongs to. A bot acts for its person and has no
  // workspace of its own, so it finds a project by its id, which names the workspace (decision 0088).
  listForPerson: (userId: string) =>
    db
      .select()
      .from(projects)
      .where(
        inArray(
          projects.organizationId,
          db.select({ id: members.organizationId }).from(members).where(eq(members.userId, userId)),
        ),
      )
      .orderBy(desc(projects.updatedAt)),

  // A project is an imported repository and the runner its threads' sandboxes run on (decision
  // 0013). The installation must be the organization's and able to see the repository, and the
  // runner must belong to the organization and not be revoked; it need not be online.
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

  // Whoever imported a project, or an owner or an admin of the workspace, changes it or deletes it
  // (decisions 0093 and 0094): the other members use it.
  async requireManager(organizationId: string, userId: string, project: { createdBy: string }) {
    if (project.createdBy === userId || (await isOwnerOrAdmin(organizationId, userId))) return;
    throw new ForbiddenError(
      "Only the person who imported the project, an owner or an admin can do that",
    );
  },

  // Moves the project to another runner (decision 0093). Only threads started from now on run
  // there: each thread keeps the runner it began on, where its workspace and history are. The
  // runner must belong to the organization and not be revoked; it need not be online.
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

  // A folder of the project's repository, as GitHub has it on the default branch, and its README
  // (decision 0082): read with the installation's token, so it needs no runner and no clone. A
  // repository the installation no longer sees, or a path that is not a folder, is not found.
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

  // One page of the default branch's commits for the project page, read with the installation's
  // token like the files and the README. A repository the installation no longer sees is not found.
  async commits(organizationId: string, id: string, page: number) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    const found = await githubService.commits(
      project.githubInstallationId,
      project.repoFullName,
      page,
      project.defaultBranch,
    );
    return { ...orNotFound(found, "Repository not found"), page };
  },

  // One page of the repository's open or closed pull requests or issues for the project page
  // (decision 0092), read with the installation's token like the commits.
  async tracked(
    organizationId: string,
    id: string,
    kind: GithubTrackedKind,
    state: GithubTrackedState,
    page: number,
  ) {
    const project = orNotFound(await projectsService.get(organizationId, id), "Project not found");
    const found = await githubService.tracked(
      project.githubInstallationId,
      project.repoFullName,
      kind,
      state,
      page,
    );
    return { ...orNotFound(found, "Repository not found"), page };
  },

  // What a runtime needs to clone the repository of a thread's project: the clone URL, the branch
  // and a short-lived read-only token (decision 0013).
  async repoAccess(threadId: string) {
    const [row] = await db
      .select({
        cloneUrl: projects.cloneUrl,
        defaultBranch: projects.defaultBranch,
        githubInstallationId: projects.githubInstallationId,
      })
      .from(threads)
      .innerJoin(projects, eq(projects.id, threads.projectId))
      .where(eq(threads.id, threadId));
    if (!row) throw new Error("Unknown thread");
    return {
      cloneUrl: row.cloneUrl,
      defaultBranch: row.defaultBranch,
      token: await githubService.cloneToken(row.githubInstallationId),
    };
  },
};
