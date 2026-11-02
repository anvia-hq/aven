import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { projects } from "@aven/db/schema/projects";
import { threads } from "@aven/db/schema/threads";
import { and, desc, eq, inArray } from "drizzle-orm";

import { ConflictError, orNotFound, UnprocessableError } from "../../errors";
import { githubService } from "../github/service";
import { runtimesService } from "../runtimes/service";
import type { ImportProjectBody } from "./schema";

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
