import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { threadPullRequests } from "@aven/db/schema/thread-pull-requests";
import { threads } from "@aven/db/schema/threads";
import { users } from "@aven/db/schema/users";
import { and, desc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";

import { ConflictError, NotFoundError, UnprocessableError } from "../../errors";
import { projectsService } from "../projects/service";
import type { CreateThreadBody, UpdateThreadBody } from "./schema";

export class ProjectNotFoundError extends UnprocessableError {}
export class ThreadNotFoundError extends NotFoundError {
  constructor() {
    super("Thread not found");
  }
}

export type ThreadPullRequest = {
  number: number;
  url: string;
  branch: string;
  title: string;
  state: "open" | "closed" | "merged";
};

// A thread as clients see it. The continuation of an unanswered question holds conversation state
// and stays server-side; clients get whether one is waiting, and the thread's pull requests, newest
// first (decision 0069). Drizzle leaves the table off a column of a one-table query, so the outer
// `threads.id` is written out: unqualified, it would be the pull request's own `id`.
const { pendingContinuation: _held, ...publicColumns } = getTableColumns(threads);
const columns = {
  ...publicColumns,
  // Who made it, for the people a shared thread is shown to.
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

/** Who is asking: a member of an organization. */
export type Viewer = { organizationId: string; userId: string };

// The threads a person may see: their own, and the ones their workspace shares (decision 0084).
const seenBy = ({ organizationId, userId }: Viewer) =>
  and(
    eq(threads.organizationId, organizationId),
    or(eq(threads.createdBy, userId), eq(threads.visibility, "workspace")),
  );

// The workspaces a person belongs to: what a bot, which has no workspace of its own, may reach for
// its person (decision 0088). A thread of a workspace they have left is not theirs to reach.
const inPersonsWorkspaces = (userId: string) =>
  inArray(
    threads.organizationId,
    db.select({ id: members.organizationId }).from(members).where(eq(members.userId, userId)),
  );

// A thread of a deleted project stays archived (decision 0094): reopening it would put a thread in
// the lists that nobody can drive. A thread that is not found is left to the update to say so.
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

  // A thread the person may read: their own, or one shared with the workspace. Anything else is
  // simply not found, as another organization's thread is.
  async readable(viewer: Viewer, id: string) {
    const [thread] = await db
      .select(columns)
      .from(threads)
      .where(and(seenBy(viewer), eq(threads.id, id)));
    if (!thread) throw new ThreadNotFoundError();
    return thread;
  },

  // A thread the person made, for whatever acts on it or on its sandbox. A shared thread is not
  // theirs to drive: it is not found here either.
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

  // The threads a person may see in every workspace they belong to, newest first: their own, and
  // the ones those workspaces share (decision 0084), for a bot acting as them (decision 0088).
  listForPerson: (userId: string, limit: number) =>
    db
      .select(columns)
      .from(threads)
      .where(
        and(
          inPersonsWorkspaces(userId),
          or(eq(threads.createdBy, userId), eq(threads.visibility, "workspace")),
        ),
      )
      .orderBy(desc(threads.updatedAt))
      .limit(limit),

  // `readable` and `owned` for a bot, which has the thread's id and not its workspace.
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

  // Every lookup is scoped to the organization: another organization's thread is simply not found.
  async get(organizationId: string, id: string) {
    const [thread] = await db
      .select(columns)
      .from(threads)
      .where(and(eq(threads.organizationId, organizationId), eq(threads.id, id)));
    return thread ?? null;
  },

  // A run was sent as this person: their credentials are what the thread's sandbox now holds.
  async markRunBy(threadId: string, userId: string) {
    await db.update(threads).set({ lastRunBy: userId }).where(eq(threads.id, threadId));
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

  // Only the creator changes a thread: its title, its state and who it is shared with.
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

  // The pull requests found for the thread's branches after a run (decisions 0044 and 0069): new
  // ones are added and the title and state of known ones are brought up to date.
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

  // Bumps the thread to the top of the list after the agent has worked on it.
  async touch(id: string) {
    await db.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, id));
  },
};
