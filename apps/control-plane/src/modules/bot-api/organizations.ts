import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { organizations } from "@aven/db/schema/organizations";
import { eq } from "drizzle-orm";

export async function organizationsOf(userId: string) {
  return db
    .select({ id: organizations.id, name: organizations.name })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, userId));
}
