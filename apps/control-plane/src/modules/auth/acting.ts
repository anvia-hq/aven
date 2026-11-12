import { db } from "@aven/db/client";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

export const ACTING_HEADER = "x-aven-acting";

type Grant = { userId: string; organizationId: string | null };

const grants = new Map<string, Grant>();

export function grantActing(userId: string, organizationId: string | null) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  grants.set(token, { userId, organizationId });
  return { token, revoke: () => void grants.delete(token) };
}

export async function actingSession(headers: Headers) {
  const token = headers.get(ACTING_HEADER);
  const grant = token ? grants.get(token) : undefined;
  if (!grant) return undefined;
  const [user] = await db.select().from(users).where(eq(users.id, grant.userId));
  if (!user) return undefined;
  const now = new Date();
  return {
    user,
    session: {
      id: `acting-${grant.userId}`,
      userId: grant.userId,
      token: "",
      expiresAt: new Date(now.getTime() + 60_000),
      ipAddress: null,
      userAgent: null,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: grant.organizationId,
    },
  };
}
