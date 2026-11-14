import { afterAll, beforeAll } from "bun:test";

import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { inArray } from "drizzle-orm";

export function keepPlatformSettings(keys: string[]) {
  let kept: (typeof platformSettings.$inferSelect)[] = [];

  beforeAll(async () => {
    kept = await db.select().from(platformSettings).where(inArray(platformSettings.key, keys));
  });

  afterAll(async () => {
    await db.delete(platformSettings).where(inArray(platformSettings.key, keys));

    if (kept.length > 0) await db.insert(platformSettings).values(kept);
  });
}
