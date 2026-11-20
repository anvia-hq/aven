import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { CLOUD_SANDBOX_LIFE_MS } from "@aven/sandbox/cloud-expiry";
import { EXTEND_EVERY_MS, idleWindows } from "@aven/sandbox/idle";
import {
  DEFAULT_DRAIN_GRACE_MS,
  DEFAULT_MAX_AGE_HOURS,
  DEFAULT_MAX_DELETE_ATTEMPTS,
  DEFAULT_SOFT_BUDGET_PERCENT,
  DEFAULT_TRANSITION_WATCHDOG_MS,
} from "@aven/sandbox/lifecycle";
import type { LifecyclePolicy } from "@aven/sandbox/types";
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
    maxAgeHours: DEFAULT_MAX_AGE_HOURS,
    maxRunning: null,
    startBurst: null,
    startEveryMinutes: START_EVERY_MINUTES,
    monthlyBudgetCents: null,
    softBudgetPercent: DEFAULT_SOFT_BUDGET_PERCENT,
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

  async maxAgeMs() {
    return (await this.current()).maxAgeHours * HOUR_MS;
  },

  async policy(): Promise<LifecyclePolicy> {
    const current = await this.current();

    return {
      agentIdleMs: current.agentIdleSeconds * 1000,
      userIdleMs: current.userIdleSeconds * 1000,
      maxAgeMs: current.maxAgeHours * HOUR_MS,
      drainGraceMs: DEFAULT_DRAIN_GRACE_MS,
      expireMs: current.expireHours * HOUR_MS,
      extendEveryMs: EXTEND_EVERY_MS,
      transitionWatchdogMs: DEFAULT_TRANSITION_WATCHDOG_MS,
      maxDeleteAttempts: DEFAULT_MAX_DELETE_ATTEMPTS,
    };
  },
};
