import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { and, eq } from "drizzle-orm";

export async function isOwnerOrAdmin(organizationId: string, userId: string) {
  const [member] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)));
  const roles = member?.role.split(",").map((role) => role.trim()) ?? [];
  return roles.some((role) => role === "owner" || role === "admin");
}
