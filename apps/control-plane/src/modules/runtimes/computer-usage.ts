import { db } from "@aven/db/client";
import { computerUsage } from "@aven/db/schema/computer-usage";
import { and, count, eq, isNull } from "drizzle-orm";

import { CLOUD_TEMPLATE_IDS } from "@aven/sandbox/cloud-config";
import type { ComputerRuntime } from "./types";

const isCloudComputer = (runtime: ComputerRuntime) =>
  runtime.parentRuntimeId !== null && CLOUD_TEMPLATE_IDS.includes(runtime.parentRuntimeId);

export const computerUsageService = {
  async opened(runtime: ComputerRuntime) {
    if (!isCloudComputer(runtime)) return;

    await db
      .insert(computerUsage)
      .values({
        runtimeId: runtime.id,
        organizationId: runtime.organizationId,
        userId: runtime.ownerId,
        provider: runtime.provider,
      })
      .onConflictDoNothing();
  },

  async closed(runtimeId: string) {
    await db
      .update(computerUsage)
      .set({ stoppedAt: new Date() })
      .where(and(eq(computerUsage.runtimeId, runtimeId), isNull(computerUsage.stoppedAt)));
  },

  async closeAll() {
    await db
      .update(computerUsage)
      .set({ stoppedAt: new Date() })
      .where(isNull(computerUsage.stoppedAt));
  },

  async runningIn(organizationId: string) {
    const [row] = await db
      .select({ total: count() })
      .from(computerUsage)
      .where(
        and(eq(computerUsage.organizationId, organizationId), isNull(computerUsage.stoppedAt)),
      );

    return row?.total ?? 0;
  },
};
