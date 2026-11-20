import { describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";

import { keepPlatformSettings } from "../../testing/kept-platform-settings";
import { cloudLifecycleService } from "./service";

keepPlatformSettings(["cloud_lifecycle"], { cleared: true });

describe("the Aven Cloud computer settings", () => {
  test("without anything saved they are the defaults, with no limit on running computers", async () => {
    expect(await cloudLifecycleService.current()).toEqual({
      agentIdleSeconds: Number(process.env.AVEN_CLOUD_AGENT_IDLE_SECONDS) || 300,
      userIdleSeconds: Number(process.env.AVEN_CLOUD_USER_IDLE_SECONDS) || 1200,
      expireHours: 48,
      maxAgeHours: 12,
      maxRunning: null,
      startBurst: null,
      startEveryMinutes: 5,
      monthlyBudgetCents: null,
      softBudgetPercent: 80,
    });
  });

  test("what is saved is what the sweeps read, in milliseconds", async () => {
    await cloudLifecycleService.save({
      agentIdleSeconds: 120,
      userIdleSeconds: 600,
      expireHours: 72,
      maxAgeHours: 8,
      maxRunning: 8,
      startBurst: 20,
      startEveryMinutes: 2,
      monthlyBudgetCents: 2500,
      softBudgetPercent: 75,
    });

    expect(await cloudLifecycleService.idleWindows()).toEqual({
      agentIdleMs: 120_000,
      userIdleMs: 600_000,
    });
    expect(await cloudLifecycleService.expireAfterMs()).toBe(72 * 3_600_000);
    expect(await cloudLifecycleService.maxAgeMs()).toBe(8 * 3_600_000);
    expect((await cloudLifecycleService.current()).maxRunning).toBe(8);
    expect((await cloudLifecycleService.current()).monthlyBudgetCents).toBe(2500);
  });

  test("resetting returns to the defaults", async () => {
    const reset = await cloudLifecycleService.reset();

    expect(reset.expireHours).toBe(48);
    expect(reset.maxRunning).toBeNull();
  });

  test("a saved value that cannot be read leaves the defaults in force", async () => {
    await db
      .insert(platformSettings)
      .values({ key: "cloud_lifecycle", value: "{not json" })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: "{not json" } });

    expect((await cloudLifecycleService.current()).expireHours).toBe(48);
  });
});
