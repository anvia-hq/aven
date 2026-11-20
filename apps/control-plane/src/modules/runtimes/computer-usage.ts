import { db } from "@aven/db/client";
import { cloudProviderConfigs } from "@aven/db/schema/cloud-provider-configs";
import { computerUsage } from "@aven/db/schema/computer-usage";
import type { BoatMachineType } from "@aven/protocol/types";
import { CLOUD_TEMPLATE_IDS } from "@aven/sandbox/cloud-config";
import { computeRunCostMicros } from "@aven/sandbox/lifecycle";
import { and, count, eq, isNull, ne } from "drizzle-orm";

import type { ComputerRuntime } from "./types";

const DEFAULT_COMPUTE_MICROS_PER_HOUR = 32_400;

const isCloudComputer = (runtime: ComputerRuntime) =>
  runtime.parentRuntimeId !== null && CLOUD_TEMPLATE_IDS.includes(runtime.parentRuntimeId);

export const computerUsageService = {
  async opened(
    runtime: ComputerRuntime & {
      providerConfigId?: string | null;
      machineType?: BoatMachineType | null;
    },
  ) {
    if (!isCloudComputer(runtime)) return;

    await db
      .insert(computerUsage)
      .values({
        runtimeId: runtime.id,
        organizationId: runtime.organizationId,
        userId: runtime.ownerId,
        provider: runtime.provider,
        providerConfigId: runtime.providerConfigId ?? null,
        machineType: runtime.machineType ?? null,
      })
      .onConflictDoNothing();
  },

  async closed(runtimeId: string, now = new Date()) {
    const [open] = await db
      .select({
        id: computerUsage.id,
        startedAt: computerUsage.startedAt,
        providerConfigId: computerUsage.providerConfigId,
      })
      .from(computerUsage)
      .where(and(eq(computerUsage.runtimeId, runtimeId), isNull(computerUsage.stoppedAt)))
      .limit(1);

    if (!open) return;

    let rate = DEFAULT_COMPUTE_MICROS_PER_HOUR;

    if (open.providerConfigId) {
      const [config] = await db
        .select({ compute: cloudProviderConfigs.computeMicrosPerHour })
        .from(cloudProviderConfigs)
        .where(eq(cloudProviderConfigs.id, open.providerConfigId))
        .limit(1);

      if (config?.compute) rate = config.compute;
    }

    const estimatedCostMicros = computeRunCostMicros(
      now.getTime() - open.startedAt.getTime(),
      rate,
    );
    await db
      .update(computerUsage)
      .set({ stoppedAt: now, estimatedCostMicros })
      .where(eq(computerUsage.id, open.id));
  },

  async closeAll() {
    await db
      .update(computerUsage)
      .set({ stoppedAt: new Date() })
      .where(isNull(computerUsage.stoppedAt));
  },

  async runningIn(organizationId: string, exceptRuntimeId?: string) {
    const [row] = await db
      .select({ total: count() })
      .from(computerUsage)
      .where(
        and(
          eq(computerUsage.organizationId, organizationId),
          isNull(computerUsage.stoppedAt),
          exceptRuntimeId === undefined ? undefined : ne(computerUsage.runtimeId, exceptRuntimeId),
        ),
      );

    return row?.total ?? 0;
  },
};
