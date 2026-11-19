import { db } from "@aven/db/client";
import { runtimes } from "@aven/db/schema/runtimes";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export async function registeredComputerOf(
  userId: string,
  isOnline: (runtimeId: string) => boolean,
) {
  const own = await db
    .select({ id: runtimes.id })
    .from(runtimes)
    .where(
      and(
        eq(runtimes.ownerId, userId),
        eq(runtimes.provider, "manual"),
        eq(runtimes.host, false),
        isNull(runtimes.parentRuntimeId),
        isNull(runtimes.revokedAt),
      ),
    )
    .orderBy(sql`${runtimes.lastSeenAt} desc nulls last`, desc(runtimes.createdAt));

  return (own.find(({ id }) => isOnline(id)) ?? own[0])?.id ?? null;
}
