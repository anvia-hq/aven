import { createSandboxRuntime } from "@aven/sandbox/runtime";

import { cloudSandboxStore } from "../cloud-lifecycle/sandbox-store";
import { cloudLifecycleService } from "../cloud-lifecycle/service";
import { spendBrakeService } from "../cloud-lifecycle/spend";
import { admission } from "./admission";
import { computerUsageService } from "./computer-usage";
import type { RuntimeConnection } from "./hub";
import { runtimesService } from "./service";

const sandboxRuntime = createSandboxRuntime<RuntimeConnection>({
  record: ({ runtimeId, provider, revoked }) =>
    runtimesService.cloudRecord(runtimeId, provider, revoked),
  saveSandboxId: (runtimeId, sandboxId) => runtimesService.setBoatSandbox(runtimeId, sandboxId),
  providerOf: (runtimeId) => runtimesService.providerOf(runtimeId),
  isExpiredCloud: (runtimeId) => runtimesService.isExpiredCloud(runtimeId),
  admit: async (runtimeId) => {
    const computer = await runtimesService.computerOf(runtimeId);

    if (computer) await admission.admit({ runtimeId, ...computer });

    await cloudSandboxStore.markStarting(runtimeId).catch(() => undefined);
  },
  onStarted: async (runtimeId) => {
    const maxAgeMs = await cloudLifecycleService.maxAgeMs();
    await cloudSandboxStore.markRunning(runtimeId, maxAgeMs).catch(() => undefined);
    const computer = await runtimesService.computerRuntimeOf(runtimeId);

    if (computer) {
      await computerUsageService.opened(computer).catch(() => undefined);
    }

    spendBrakeService.invalidate();
  },
  onStopped: async (runtimeId) => {
    const expireMs = await cloudLifecycleService.expireAfterMs();
    await cloudSandboxStore.markStopped(runtimeId, expireMs).catch(() => undefined);
    await computerUsageService.closed(runtimeId).catch(() => undefined);
    spendBrakeService.invalidate();
  },
});

export const { reachRunner, releaseThread, stopCloudRuntime, extendCloudRuntime } = sandboxRuntime;

export { EXPIRED_COMPUTER } from "@aven/sandbox/runtime";
