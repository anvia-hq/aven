import { db } from "@aven/db/client";
import { cloudProviderConfigs } from "@aven/db/schema/cloud-provider-configs";
import { cloudSandboxes } from "@aven/db/schema/cloud-sandboxes";
import { computerUsage } from "@aven/db/schema/computer-usage";
import {
  computeRunCostMicros,
  computeStorageCostMicros,
  DEFAULT_STOPPED_DISK_GB,
  evaluateSpend,
} from "@aven/sandbox/lifecycle";
import { lizardComputeMicrosPerHour } from "@aven/sandbox/lizard/config";
import type { SpendVerdict } from "@aven/sandbox/types";
import { eq, gte, isNull, or } from "drizzle-orm";

import { cloudLifecycleService } from "./service";

const DEFAULT_COMPUTE_MICROS_PER_HOUR = 32_400;

const DEFAULT_STORAGE_MICROS_PER_GB_MONTH = 140_000;

const CACHE_TTL_MS = 30_000;

const MICROS_PER_CENT = 10_000;

let cached: { at: number; verdict: SpendVerdict } | null = null;

function monthStartUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export const spendBrakeService = {
  invalidate() {
    cached = null;
  },

  async verdict(now = new Date()): Promise<SpendVerdict> {
    if (cached && now.getTime() - cached.at < CACHE_TTL_MS) return cached.verdict;

    const settings = await cloudLifecycleService.current();
    const budgetMicros =
      settings.monthlyBudgetCents === null ? null : settings.monthlyBudgetCents * MICROS_PER_CENT;
    const start = monthStartUtc(now);
    const configs = await db
      .select({
        id: cloudProviderConfigs.id,
        provider: cloudProviderConfigs.provider,
        compute: cloudProviderConfigs.computeMicrosPerHour,
        storage: cloudProviderConfigs.storageMicrosPerGbMonth,
      })
      .from(cloudProviderConfigs);
    const rateByConfig = new Map(
      configs.map((config) => [
        config.id,
        {
          provider: config.provider,
          compute: config.compute ?? DEFAULT_COMPUTE_MICROS_PER_HOUR,
          storage: config.storage ?? DEFAULT_STORAGE_MICROS_PER_GB_MONTH,
        },
      ]),
    );
    const usageRows = await db
      .select({
        startedAt: computerUsage.startedAt,
        stoppedAt: computerUsage.stoppedAt,
        providerConfigId: computerUsage.providerConfigId,
        machineType: computerUsage.machineType,
        estimatedCostMicros: computerUsage.estimatedCostMicros,
      })
      .from(computerUsage)
      .where(or(isNull(computerUsage.stoppedAt), gte(computerUsage.stoppedAt, start)));
    let usedMicros = 0;

    for (const row of usageRows) {
      if (row.stoppedAt !== null && row.estimatedCostMicros !== null) {
        usedMicros += row.estimatedCostMicros;
        continue;
      }

      const from = Math.max(row.startedAt.getTime(), start.getTime());
      const to = (row.stoppedAt ?? now).getTime();
      const config = row.providerConfigId ? rateByConfig.get(row.providerConfigId) : undefined;
      const rate =
        config?.provider === "lizard" && row.machineType
          ? lizardComputeMicrosPerHour(row.machineType)
          : (config?.compute ?? DEFAULT_COMPUTE_MICROS_PER_HOUR);
      usedMicros += computeRunCostMicros(to - from, rate);
    }

    const stoppedRows = await db
      .select({
        stoppedAt: cloudSandboxes.stoppedAt,
        providerConfigId: cloudSandboxes.providerConfigId,
      })
      .from(cloudSandboxes)
      .where(eq(cloudSandboxes.state, "stopped"));

    for (const row of stoppedRows) {
      if (!row.stoppedAt) continue;

      const from = Math.max(row.stoppedAt.getTime(), start.getTime());
      const storageRate =
        (row.providerConfigId ? rateByConfig.get(row.providerConfigId)?.storage : undefined) ??
        DEFAULT_STORAGE_MICROS_PER_GB_MONTH;
      usedMicros += computeStorageCostMicros(
        now.getTime() - from,
        DEFAULT_STOPPED_DISK_GB,
        storageRate,
      );
    }

    const verdict = evaluateSpend({
      usedMicros,
      budgetMicros,
      softLimitPercent: settings.softBudgetPercent,
    });
    cached = { at: now.getTime(), verdict };
    return verdict;
  },
};
