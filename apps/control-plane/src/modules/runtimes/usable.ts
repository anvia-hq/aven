import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { runtimes } from "@aven/db/schema/runtimes";
import { and, eq, isNull } from "drizzle-orm";

import { UnprocessableError } from "../../errors";
import { LOCAL_RUNTIME_ID } from "./service";

export async function requireUsableRuntime(userId: string, runtimeId: string) {
  const [row] = await db
    .select({
      host: runtimes.host,
      ownerId: runtimes.ownerId,
      organizationId: runtimes.organizationId,
    })
    .from(runtimes)
    .where(and(eq(runtimes.id, runtimeId), isNull(runtimes.revokedAt)));
  const refused = new UnprocessableError("That runner is not one you can use");

  if (!row) throw refused;

  if (runtimeId === LOCAL_RUNTIME_ID) return;

  if (row.host) {
    if (row.ownerId !== userId) throw refused;

    return;
  }

  if (!row.organizationId) throw refused;

  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.organizationId, row.organizationId), eq(members.userId, userId)));

  if (!member) throw refused;
}
