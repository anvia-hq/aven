import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { inArray } from "drizzle-orm";

export async function setAsidePlatformSettings(keys: string[]) {
  const saved = await db.select().from(platformSettings).where(inArray(platformSettings.key, keys));

  await db.delete(platformSettings).where(inArray(platformSettings.key, keys));

  return async function restore() {
    await db.delete(platformSettings).where(inArray(platformSettings.key, keys));

    if (saved.length > 0) await db.insert(platformSettings).values(saved);
  };
}
