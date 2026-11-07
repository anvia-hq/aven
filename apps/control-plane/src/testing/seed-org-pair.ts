import { db } from "@aven/db/client";
import { organizations } from "@aven/db/schema/organizations";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

export async function seedOrgPair() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const userId = `u-${suffix}`;
  const orgA = `org-a-${suffix}`;
  const orgB = `org-b-${suffix}`;

  await db.insert(users).values({ id: userId, name: "T", email: `${userId}@aven.test` });
  await db.insert(organizations).values([
    { id: orgA, name: "A", slug: orgA },
    { id: orgB, name: "B", slug: orgB },
  ]);

  return {
    userId,
    orgA,
    orgB,
    async cleanup() {
      await db.delete(users).where(eq(users.id, userId));
      await db.delete(organizations).where(eq(organizations.id, orgA));
      await db.delete(organizations).where(eq(organizations.id, orgB));
    },
  };
}
