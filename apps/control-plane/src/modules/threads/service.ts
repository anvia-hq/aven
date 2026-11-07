import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { threadPullRequests } from "@aven/db/schema/thread-pull-requests";
import { threads } from "@aven/db/schema/threads";
import { users } from "@aven/db/schema/users";
import { and, desc, eq, getTableColumns, inArray, ne, or, sql } from "drizzle-orm";

import { ConflictError, NotFoundError, UnprocessableError } from "../../errors";
import { projectsService } from "../projects/service";
import type { CreateThreadBody, UpdateThreadBody } from "./schema";
import type { ThreadPullRequest, Viewer } from "./types";

export class ProjectNotFoundError extends UnprocessableError {}
export class ThreadNotFoundError extends NotFoundError {
  constructor() {
    super("Thread not found");
  }
}

const { pendingContinuation: _held, ...publicColumns } = getTableColumns(threads);
const columns = {
  ...publicColumns,
  createdByName: sql<string>`(select ${users.name} from ${users} where ${users.id} = "threads"."created_by")`,
  awaitingAnswer: sql<boolean>`${threads.pendingContinuation} is not null`,
  pullRequests: sql<ThreadPullRequest[]>`coalesce((
    select json_agg(json_build_object(
      'number', ${threadPullRequests.number},
      'url', ${threadPullRequests.url},
      'branch', ${threadPullRequests.branch},
      'title', ${threadPullRequests.title},
      'state', ${threadPullRequests.state}
    ) order by ${threadPullRequests.number} desc)
    from ${threadPullRequests}
    where ${threadPullRequests.threadId} = "threads"."id"
  ), '[]'::json)`,
};

const seenBy = ({ organizationId, userId }: Viewer) =>
  and(
    eq(threads.organizationId, organizationId),
    or(eq(threads.createdBy, userId), eq(threads.visibility, "workspace")),
  );

const inPersonsWorkspaces = (userId: string) =>
  inArray(
    threads.organizationId,
    db.select({ id: members.organizationId }).from(members).where(eq(members.userId, userId)),
  );

async function requireLiveProject(organizationId: string, threadId: string) {
  const [thread] = await db
    .select({ projectId: threads.projectId })
    .from(threads)
    .where(and(eq(threads.organizationId, organizationId), eq(threads.id, threadId)));
  if (thread && !(await projectsService.get(organizationId, thread.projectId))) {
    throw new ConflictError("This thread's project was deleted, so it stays archived");
  }
}

export const threadsService = {
  list: (viewer: Viewer) =>
    db.select(columns).from(threads).where(seenBy(viewer)).orderBy(desc(threads.updatedAt)),

  async readable(viewer: Viewer, id: string) {
    const [thread] = await db
      .select(columns)
      .from(threads)
      .where(and(seenBy(viewer), eq(threads.id, id)));
    if (!thread) throw new ThreadNotFoundError();
    return thread;
  },

  async owned({ organizationId, userId }: Viewer, id: string) {
    const [thread] = await db
      .select(columns)
      .from(threads)
      .where(
        and(
          eq(threads.organizationId, organizationId),
          eq(threads.createdBy, userId),
          eq(threads.id, id),
        ),
      );
    if (!thread) throw new ThreadNotFoundError();
    return thread;
  },

  listForPerson: (
    userId: string,
    limit: number,
    narrow: { archived?: boolean; projectId?: string } = {},
  ) =>
    db
      .select(columns)
      .from(threads)
      .where(
        and(
          inPersonsWorkspaces(userId),
          or(eq(threads.createdBy, userId), eq(threads.visibility, "workspace")),
          narrow.archived === undefined
            ? undefined
            : narrow.archived
              ? eq(threads.state, "archived")
              : ne(threads.state, "archived"),
          narrow.projectId === undefined ? undefined : eq(threads.projectId, narrow.projectId),
        ),
      )
      .orderBy(desc(threads.updatedAt))
      .limit(limit),

  async readableForPerson(userId: string, id: string) {
    const [thread] = await db
      .select(columns)
      .from(threads)
      .where(
        and(
          eq(threads.id, id),
          inPersonsWorkspaces(userId),
          or(eq(threads.createdBy, userId), eq(threads.visibility, "workspace")),
        ),
      );
    if (!thread) throw new ThreadNotFoundError();
    return thread;
  },

  async ownedForPerson(userId: string, id: string) {
    const [thread] = await db
      .select(columns)
      .from(threads)
      .where(and(eq(threads.id, id), eq(threads.createdBy, userId), inPersonsWorkspaces(userId)));
    if (!thread) throw new ThreadNotFoundError();
    return thread;
  },

  async get(organizationId: string, id: string) {
    const [thread] = await db
      .select(columns)
      .from(threads)
      .where(and(eq(threads.organizationId, organizationId), eq(threads.id, id)));
    return thread ?? null;
  },

  async liveForks(parentThreadId: string) {
    const [found] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(threads)
      .where(and(eq(threads.parentThreadId, parentThreadId), ne(threads.state, "archived")));
    return found?.count ?? 0;
  },

  async byId(id: string) {
    const [thread] = await db.select(columns).from(threads).where(eq(threads.id, id));
    return thread ?? null;
  },

  async liveForkList(parentThreadId: string) {
    return db
      .select({ id: threads.id, title: threads.title })
      .from(threads)
      .where(and(eq(threads.parentThreadId, parentThreadId), ne(threads.state, "archived")));
  },

  async markRunBy(threadId: string, userId: string) {
    await db.update(threads).set({ lastRunBy: userId }).where(eq(threads.id, threadId));
  },

  async require(organizationId: string, id: string) {
    const thread = await this.get(organizationId, id);
    if (!thread) throw new ThreadNotFoundError();
    return thread;
  },

  async create(
    organizationId: string,
    userId: string,
    body: CreateThreadBody,
    placement?: { parentThreadId?: string; runtimeId: string },
  ) {
    const project = await projectsService.get(organizationId, body.projectId);
    if (!project) throw new ProjectNotFoundError("Project not found");
    const [thread] = await db
      .insert(threads)
      .values({
        organizationId,
        projectId: project.id,
        createdBy: userId,
        runtimeId: placement?.runtimeId ?? project.runtimeId,
        parentThreadId: placement?.parentThreadId,
        title: body.title ?? project.name,
      })
      .returning(columns);
    return thread!;
  },

  async update({ organizationId, userId }: Viewer, id: string, body: UpdateThreadBody) {
    if (body.state && body.state !== "archived") await requireLiveProject(organizationId, id);
    const [thread] = await db
      .update(threads)
      .set(body)
      .where(
        and(
          eq(threads.organizationId, organizationId),
          eq(threads.createdBy, userId),
          eq(threads.id, id),
        ),
      )
      .returning(columns);
    return thread ?? null;
  },

  async reopen(thread: { id: string; state: string }) {
    if (thread.state === "open") return;
    await db.update(threads).set({ state: "open" }).where(eq(threads.id, thread.id));
  },

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

  async saveLastError(id: string, message: string | null) {
    await db
      .update(threads)
      .set({ lastError: message, updatedAt: sql`${threads.updatedAt}` })
      .where(eq(threads.id, id));
  },

  async lastError(id: string) {
    const [row] = await db
      .select({ lastError: threads.lastError })
      .from(threads)
      .where(eq(threads.id, id));
    return row?.lastError ?? null;
  },

  async savePullRequests(id: string, pullRequests: ThreadPullRequest[]) {
    if (pullRequests.length === 0) return;
    await db
      .insert(threadPullRequests)
      .values(pullRequests.map((pullRequest) => ({ threadId: id, ...pullRequest })))
      .onConflictDoUpdate({
        target: [threadPullRequests.threadId, threadPullRequests.number],
        set: {
          url: sql`excluded.url`,
          branch: sql`excluded.branch`,
          title: sql`excluded.title`,
          state: sql`excluded.state`,
          updatedAt: new Date(),
        },
      });
  },

  async touch(id: string) {
    await db.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, id));
  },
};
