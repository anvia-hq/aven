import { db } from "@aven/db/client";
import { threadMentions } from "@aven/db/schema/thread-mentions";
import { threads } from "@aven/db/schema/threads";
import { users } from "@aven/db/schema/users";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

import { personMentions, spoken } from "./addressing";
import type { MentionEntry } from "./types";

const EXCERPT_CHARS = 160;
const LISTED = 30;

const visibleTo = (userId: string) =>
  or(eq(threads.createdBy, userId), eq(threads.visibility, "workspace"));

export const threadMentionsService = {
  async record(threadId: string, authorId: string, text: string) {
    const wanted = personMentions(text).flatMap(({ id }) => (id === authorId ? [] : [id]));

    if (wanted.length === 0) return;

    const real = await db.select({ id: users.id }).from(users).where(inArray(users.id, wanted));

    if (real.length === 0) return;

    const excerpt = spoken(text).replace(/\s+/g, " ").trim().slice(0, EXCERPT_CHARS);
    await db
      .insert(threadMentions)
      .values(real.map(({ id }) => ({ threadId, userId: id, authorId, excerpt })))
      .onConflictDoUpdate({
        target: [threadMentions.threadId, threadMentions.userId],
        set: { authorId, excerpt, readAt: null, createdAt: new Date() },
      });
  },

  async waiting(organizationId: string, userId: string) {
    const rows = await db
      .select({ threadId: threadMentions.threadId })
      .from(threadMentions)
      .innerJoin(threads, eq(threads.id, threadMentions.threadId))
      .where(
        and(
          eq(threadMentions.userId, userId),
          isNull(threadMentions.readAt),
          eq(threads.organizationId, organizationId),
          visibleTo(userId),
        ),
      );
    return rows.map(({ threadId }) => threadId);
  },

  async list(organizationId: string, userId: string): Promise<MentionEntry[]> {
    const rows = await db
      .select({
        threadId: threadMentions.threadId,
        title: threads.title,
        authorName: users.name,
        authorImage: users.image,
        excerpt: threadMentions.excerpt,
        createdAt: threadMentions.createdAt,
        readAt: threadMentions.readAt,
      })
      .from(threadMentions)
      .innerJoin(threads, eq(threads.id, threadMentions.threadId))
      .leftJoin(users, eq(users.id, threadMentions.authorId))
      .where(
        and(
          eq(threadMentions.userId, userId),
          eq(threads.organizationId, organizationId),
          visibleTo(userId),
        ),
      )
      .orderBy(desc(threadMentions.createdAt))
      .limit(LISTED);
    return rows.map(({ readAt, createdAt, ...row }) => ({
      ...row,
      createdAt: createdAt.toISOString(),
      read: readAt !== null,
    }));
  },

  async seen(userId: string, threadId: string) {
    await db
      .update(threadMentions)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(threadMentions.userId, userId),
          eq(threadMentions.threadId, threadId),
          isNull(threadMentions.readAt),
        ),
      );
  },

  async seenAll(organizationId: string, userId: string) {
    const inWorkspace = db
      .select({ id: threads.id })
      .from(threads)
      .where(eq(threads.organizationId, organizationId));
    await db
      .update(threadMentions)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(threadMentions.userId, userId),
          isNull(threadMentions.readAt),
          inArray(threadMentions.threadId, inWorkspace),
        ),
      );
  },
};
