import { db } from "@aven/db/client";
import { threadMentions } from "@aven/db/schema/thread-mentions";
import { threads } from "@aven/db/schema/threads";
import { users } from "@aven/db/schema/users";
import { and, eq, inArray, or } from "drizzle-orm";

import { personMentions } from "./addressing";

export const threadMentionsService = {
  async record(threadId: string, authorId: string, text: string) {
    const wanted = personMentions(text)
      .map(({ id }) => id)
      .filter((id) => id !== authorId);
    if (wanted.length === 0) return;
    const real = await db.select({ id: users.id }).from(users).where(inArray(users.id, wanted));
    if (real.length === 0) return;
    await db
      .insert(threadMentions)
      .values(real.map(({ id }) => ({ threadId, userId: id })))
      .onConflictDoUpdate({
        target: [threadMentions.threadId, threadMentions.userId],
        set: { createdAt: new Date() },
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
          eq(threads.organizationId, organizationId),
          or(eq(threads.createdBy, userId), eq(threads.visibility, "workspace")),
        ),
      );
    return rows.map(({ threadId }) => threadId);
  },

  async seen(userId: string, threadId: string) {
    await db
      .delete(threadMentions)
      .where(and(eq(threadMentions.userId, userId), eq(threadMentions.threadId, threadId)));
  },
};
