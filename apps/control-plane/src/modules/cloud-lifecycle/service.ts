import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { CLOUD_SANDBOX_LIFE_MS } from "@aven/sandbox/cloud-expiry";
import { idleWindows } from "@aven/sandbox/idle";
import { eq } from "drizzle-orm";

import { saveCloudLifecycleBody } from "./schema";
import type { CloudLifecycle } from "./types";

const KEY = "cloud_lifecycle";

const START_EVERY_MINUTES = 5;

const HOUR_MS = 3_600_000;

function defaults(env: Record<string, string | undefined> = process.env): CloudLifecycle {
  const windows = idleWindows(env);

  return {
    agentIdleSeconds: windows.agentIdleMs / 1000,
    userIdleSeconds: windows.userIdleMs / 1000,
    expireHours: CLOUD_SANDBOX_LIFE_MS / HOUR_MS,
    maxRunning: null,
    startBurst: null,
    startEveryMinutes: START_EVERY_MINUTES,
  };
}

async function stored() {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, KEY));

  if (!row) return null;

  try {
    const parsed = saveCloudLifecycleBody.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : null;
  } catch {
    console.error(`The saved Aven Cloud computer settings are not a readable value (${KEY})`);
    return null;
  }
}

export const cloudLifecycleService = {
  async current(): Promise<CloudLifecycle> {
    return (await stored()) ?? defaults();
  },

  async save(body: CloudLifecycle) {
    const value = JSON.stringify(body);

    await db
      .insert(platformSettings)
      .values({ key: KEY, value })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
    return this.current();
  },

  async reset() {
    await db.delete(platformSettings).where(eq(platformSettings.key, KEY));
    return this.current();
  },

  async idleWindows() {
    const { agentIdleSeconds, userIdleSeconds } = await this.current();

    return { agentIdleMs: agentIdleSeconds * 1000, userIdleMs: userIdleSeconds * 1000 };
  },

  async expireAfterMs() {
    return (await this.current()).expireHours * HOUR_MS;
  },
};
