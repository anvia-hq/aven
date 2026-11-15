import { createSandboxRuntime } from "@aven/sandbox/runtime";
import type { RuntimeConnection } from "./hub";
import { runtimesService } from "./service";

const sandboxRuntime = createSandboxRuntime<RuntimeConnection>({
  record: ({ runtimeId, provider, revoked }) =>
    runtimesService.cloudRecord(runtimeId, provider, revoked),
  saveSandboxId: (runtimeId, sandboxId) => runtimesService.setBoatSandbox(runtimeId, sandboxId),
  providerOf: (runtimeId) => runtimesService.providerOf(runtimeId),
  isExpiredCloud: (runtimeId) => runtimesService.isExpiredCloud(runtimeId),
});

export const { reachRunner, releaseThread, stopCloudRuntime, extendCloudRuntime } = sandboxRuntime;

export { EXPIRED_COMPUTER } from "@aven/sandbox/runtime";
