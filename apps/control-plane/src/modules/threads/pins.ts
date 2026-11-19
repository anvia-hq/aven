import { db } from "@aven/db/client";
import { threadPins } from "@aven/db/schema/thread-pins";
import { and, eq } from "drizzle-orm";

async function pinnedAt(userId: string, threadId: string): Promise<string | null> {
  const [row] = await db
    .select({ pinnedAt: threadPins.pinnedAt })
    .from(threadPins)
    .where(and(eq(threadPins.threadId, threadId), eq(threadPins.userId, userId)));
  return row?.pinnedAt.toISOString() ?? null;
}

export const threadPinsService = {
  async pin(userId: string, threadId: string): Promise<{ pinnedAt: string }> {
    await db.insert(threadPins).values({ threadId, userId }).onConflictDoNothing();
    return { pinnedAt: (await pinnedAt(userId, threadId))! };
  },

  async unpin(userId: string, threadId: string): Promise<{ pinnedAt: null }> {
    await db
      .delete(threadPins)
      .where(and(eq(threadPins.threadId, threadId), eq(threadPins.userId, userId)));
    return { pinnedAt: null };
  },

  pinnedAt,
};
