import { db } from "@aven/db/client";
import { projects } from "@aven/db/schema/projects";
import { threadContextSplits } from "@aven/db/schema/thread-context-splits";
import { threadMessageSenders } from "@aven/db/schema/thread-message-senders";
import { threadNarrations } from "@aven/db/schema/thread-narrations";
import { threadPlanLimits } from "@aven/db/schema/thread-plan-limits";
import { threadPullRequests } from "@aven/db/schema/thread-pull-requests";
import { threadRunTimes } from "@aven/db/schema/thread-run-times";
import { threads } from "@aven/db/schema/threads";
import { CONTEXT_SEGMENT_IDS } from "@aven/protocol/context-segments";
import type {
  ContextSegment,
  ContextSegmentId,
  PlanLimit,
  PlanLimitStatus,
  PlanLimitWindow,
  TimelineIcon,
  TimelineTone,
  ToolNarration,
} from "@aven/protocol/types";
import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";

import type { ThreadPullRequest } from "./types";

export const threadRunMetadata = {
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

  async saveWorkedTime(threadId: string, messageIndex: number, workedMs: number) {
    await db
      .insert(threadRunTimes)
      .values({ threadId, messageIndex, workedMs })
      .onConflictDoUpdate({
        target: [threadRunTimes.threadId, threadRunTimes.messageIndex],
        set: { workedMs: sql`${threadRunTimes.workedMs} + ${workedMs}` },
      });
  },

  async workedTimes(threadId: string) {
    const rows = await db
      .select({ index: threadRunTimes.messageIndex, ms: threadRunTimes.workedMs })
      .from(threadRunTimes)
      .where(eq(threadRunTimes.threadId, threadId));
    return new Map(rows.map((row) => [row.index, row.ms]));
  },

  async saveContextSplit(
    threadId: string,
    split: { usedTokens: number; segments: ContextSegment[] },
  ) {
    await db
      .insert(threadContextSplits)
      .values({ threadId, ...split })
      .onConflictDoUpdate({
        target: threadContextSplits.threadId,
        set: { ...split, updatedAt: new Date() },
      });
  },

  async contextSplit(threadId: string) {
    const [row] = await db
      .select()
      .from(threadContextSplits)
      .where(eq(threadContextSplits.threadId, threadId));

    if (!row) return null;

    const known: readonly string[] = CONTEXT_SEGMENT_IDS;
    const segments = row.segments.flatMap((segment) =>
      known.includes(segment.id)
        ? [{ id: segment.id as ContextSegmentId, tokens: segment.tokens }]
        : [],
    );
    return { usedTokens: row.usedTokens, segments };
  },

  async savePlanLimits(threadId: string, limits: readonly PlanLimit[]) {
    for (const limit of limits) {
      const values = {
        status: limit.status,
        percent: limit.percent,
        resetsAt: limit.resetsAt ?? null,
      };
      await db
        .insert(threadPlanLimits)
        .values({ threadId, window: limit.window, ...values })
        .onConflictDoUpdate({
          target: [threadPlanLimits.threadId, threadPlanLimits.window],
          set: { ...values, updatedAt: new Date() },
        });
    }
  },

  async planLimits(threadId: string): Promise<PlanLimit[]> {
    const rows = await db
      .select()
      .from(threadPlanLimits)
      .where(eq(threadPlanLimits.threadId, threadId));
    return rows.map((row) => {
      const limit: PlanLimit = {
        window: row.window as PlanLimitWindow,
        status: row.status as PlanLimitStatus,
        percent: row.percent,
      };

      if (row.resetsAt !== null) limit.resetsAt = row.resetsAt;

      return limit;
    });
  },

  async saveSender(threadId: string, messageIndex: number, senderId: string) {
    await db
      .insert(threadMessageSenders)
      .values({ threadId, messageIndex, senderId })
      .onConflictDoUpdate({
        target: [threadMessageSenders.threadId, threadMessageSenders.messageIndex],
        set: { senderId },
      });
  },

  async senders(threadId: string) {
    const rows = await db
      .select({ index: threadMessageSenders.messageIndex, id: threadMessageSenders.senderId })
      .from(threadMessageSenders)
      .where(eq(threadMessageSenders.threadId, threadId));
    return new Map(rows.map((row) => [row.index, row.id]));
  },

  async saveNarration(threadId: string, narration: ToolNarration) {
    await db
      .insert(threadNarrations)
      .values({
        threadId,
        toolId: narration.toolId,
        label: narration.label,
        outcome: narration.outcome ?? null,
        icon: narration.icon ?? null,
        tone: narration.tone ?? null,
      })
      .onConflictDoUpdate({
        target: [threadNarrations.threadId, threadNarrations.toolId],
        set: {
          label: narration.label,
          outcome: narration.outcome ?? null,
          icon: narration.icon ?? null,
          tone: narration.tone ?? null,
        },
      });
  },

  async narrations(threadId: string): Promise<Record<string, ToolNarration>> {
    const rows = await db
      .select()
      .from(threadNarrations)
      .where(eq(threadNarrations.threadId, threadId));
    const map: Record<string, ToolNarration> = {};
    for (const row of rows) {
      const entry: ToolNarration = { toolId: row.toolId, label: row.label };

      if (row.outcome) entry.outcome = row.outcome;

      if (row.icon) entry.icon = row.icon as TimelineIcon;

      if (row.tone) entry.tone = row.tone as TimelineTone;

      map[row.toolId] = entry;
    }
    return map;
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

  async openPullRequests(limit: number) {
    const rows = await db
      .select({
        threadId: threads.id,
        userId: threads.createdBy,
        threadTitle: threads.title,
        installationId: projects.githubInstallationId,
        repository: projects.repoFullName,
        number: threadPullRequests.number,
        url: threadPullRequests.url,
        branch: threadPullRequests.branch,
        title: threadPullRequests.title,
      })
      .from(threadPullRequests)
      .innerJoin(threads, eq(threads.id, threadPullRequests.threadId))
      .innerJoin(projects, eq(projects.id, threads.projectId))
      .where(
        and(
          eq(threadPullRequests.state, "open"),
          ne(threads.state, "archived"),
          isNotNull(projects.githubInstallationId),
          isNotNull(projects.repoFullName),
          isNull(projects.deletedAt),
        ),
      )
      .orderBy(desc(threadPullRequests.createdAt))
      .limit(limit);
    return rows.flatMap(({ installationId, repository, ...row }) =>
      installationId && repository ? [{ ...row, installationId, repository }] : [],
    );
  },
};
