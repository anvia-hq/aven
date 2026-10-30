import { db } from "@aven/db/client";
import { threads } from "@aven/db/schema/threads";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";

import { NotFoundError, UnprocessableError } from "../../errors";
import { projectsService } from "../projects/service";
import type { CreateThreadBody, UpdateThreadBody } from "./schema";

export class ProjectNotFoundError extends UnprocessableError {}
export class ThreadNotFoundError extends NotFoundError {
  constructor() {
    super("Thread not found");
  }
}

// A thread as clients see it. The continuation of an unanswered question holds conversation state
// and stays server-side; clients get whether one is waiting.
const { pendingContinuation: _held, ...publicColumns } = getTableColumns(threads);
const columns = {
  ...publicColumns,
  awaitingAnswer: sql<boolean>`${threads.pendingContinuation} is not null`,
};

export const threadsService = {
  list: (organizationId: string) =>
    db
      .select(columns)
      .from(threads)
      .where(eq(threads.organizationId, organizationId))
      .orderBy(desc(threads.updatedAt)),

  // Every lookup is scoped to the organization: another organization's thread is simply not found.
  async get(organizationId: string, id: string) {
    const [thread] = await db
      .select(columns)
      .from(threads)
      .where(and(eq(threads.organizationId, organizationId), eq(threads.id, id)));
    return thread ?? null;
  },

  // Like `get`, for a route that cannot go on without the thread.
  async require(organizationId: string, id: string) {
    const thread = await this.get(organizationId, id);
    if (!thread) throw new ThreadNotFoundError();
    return thread;
  },

  async create(organizationId: string, userId: string, body: CreateThreadBody) {
    const project = await projectsService.get(organizationId, body.projectId);
    if (!project) throw new ProjectNotFoundError("Project not found");
    const [thread] = await db
      .insert(threads)
      .values({
        organizationId,
        projectId: project.id,
        createdBy: userId,
        runtimeId: project.runtimeId,
        title: body.title ?? project.name,
      })
      .returning(columns);
    return thread!;
  },

  async update(organizationId: string, id: string, body: UpdateThreadBody) {
    const [thread] = await db
      .update(threads)
      .set(body)
      .where(and(eq(threads.organizationId, organizationId), eq(threads.id, id)))
      .returning(columns);
    return thread ?? null;
  },

  // The run that stopped on the agent's question waits for the answer here (decision 0020).
  async saveContinuation(id: string, continuation: unknown) {
    await db.update(threads).set({ pendingContinuation: continuation }).where(eq(threads.id, id));
  },

  async continuation(id: string) {
    const [row] = await db
      .select({ continuation: threads.pendingContinuation })
      .from(threads)
      .where(eq(threads.id, id));
    return row?.continuation ?? null;
  },

  async clearContinuation(id: string) {
    await db.update(threads).set({ pendingContinuation: null }).where(eq(threads.id, id));
  },

  // The pull request the thread was shipped as (decision 0040).
  async setPullRequest(id: string, pullRequest: { number: number; url: string }) {
    await db
      .update(threads)
      .set({ pullRequestNumber: pullRequest.number, pullRequestUrl: pullRequest.url })
      .where(eq(threads.id, id));
  },

  // Bumps the thread to the top of the list after the agent has worked on it.
  async touch(id: string) {
    await db.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, id));
  },
};
