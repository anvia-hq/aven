import { db } from "@aven/db/client";
import { sessions } from "@aven/db/schema/sessions";
import { eq, isNull } from "drizzle-orm";

import { ensurePersonalOrganization } from "../src/modules/auth/service";

const stale = await db
  .select({ id: sessions.id, userId: sessions.userId })
  .from(sessions)
  .where(isNull(sessions.activeOrganizationId));

console.log(`Found ${stale.length} session(s) with no active organization.`);

let fixed = 0;
for (const session of stale) {
  try {
    const organizationId = await ensurePersonalOrganization(session.userId);
    await db
      .update(sessions)
      .set({ activeOrganizationId: organizationId })
      .where(eq(sessions.id, session.id));
    console.log(`  session ${session.id} (user ${session.userId}) -> ${organizationId}`);
    fixed += 1;
  } catch (error) {
    console.error(`  session ${session.id} (user ${session.userId}): skipped —`, error);
  }
}

console.log(`Done: fixed ${fixed}/${stale.length}.`);
process.exit(0);
