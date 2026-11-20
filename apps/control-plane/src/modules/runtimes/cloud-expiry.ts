import { cloudSandboxRemover, isCloudProvider } from "@aven/sandbox/cloud-config";
import {
  CLOUD_SANDBOX_LIFE_MS,
  createCloudExpiry as createSweep,
} from "@aven/sandbox/cloud-expiry";
import type { CloudProviderName } from "@aven/sandbox/cloud-config";
import type { ProviderCredentials, SandboxRemover } from "@aven/sandbox/types";
import type { RuntimeProviderKind } from "@aven/protocol/types";
import { cloudLifecycleService } from "../cloud-lifecycle/service";
import { runtimesService } from "./service";

export { CLOUD_SANDBOX_LIFE_MS };

type Options = {
  intervalMs: number;
  afterMs?: number | (() => Promise<number>);
  remove?: Partial<Record<CloudProviderName, SandboxRemover>>;
};

export function createCloudExpiry({
  intervalMs,
  afterMs = () => cloudLifecycleService.expireAfterMs(),
  remove,
}: Options) {
  const remover = async (
    provider: RuntimeProviderKind,
    sandboxId: string,
    credentials?: ProviderCredentials,
  ) => {
    const override = isCloudProvider(provider) ? remove?.[provider] : undefined;

    if (override) return override(sandboxId, credentials);

    return cloudSandboxRemover(provider, sandboxId, credentials);
  };

  return createSweep({
    intervalMs,
    afterMs,
    idle: (before) => runtimesService.idleCloudSandboxes(before),
    expire: (runtimeId) => runtimesService.expireCloudSandbox(runtimeId),
    remove: remover,
  });
}
