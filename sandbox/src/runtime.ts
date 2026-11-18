import {
  CLOUD_OFF,
  cloudEnabled,
  cloudProvider,
  cloudProviderNames,
  isCloudProvider,
} from "./cloud-config";
import { RuntimeOfflineError } from "./offline";
import type {
  ProviderDeps,
  RunnerPlace,
  SandboxHub,
  SandboxProvider,
  SandboxRunner,
  SandboxStore,
  ThreadPlace,
} from "./types";
import type { CloudProviderName } from "./cloud-config";
import type { RuntimeProviderKind } from "@aven/protocol/types";

const RELEASE_TIMEOUT_MS = 30_000;

export const EXPIRED_COMPUTER =
  "This Aven Cloud computer was deleted after going unused for too long. Continue the thread to start a new one";

function manualProvider<T extends SandboxRunner>(): SandboxProvider<T> {
  return {
    kind: "manual",
    async start(_place, offline) {
      throw new RuntimeOfflineError(offline);
    },
    async release(place, runner) {
      if (!runner) return;

      await runner.call("sandbox.release", { threadId: place.threadId }, RELEASE_TIMEOUT_MS);
    },
  };
}

export function createSandboxRuntime<T extends SandboxRunner>(store: SandboxStore) {
  const depsFor = (name: CloudProviderName, hub: SandboxHub<T>): ProviderDeps<T> => ({
    hub,
    record: (input) =>
      store.record({ provider: name, runtimeId: input.runtimeId, revoked: input.revoked }),
    saveSandboxId: store.saveSandboxId,
  });

  const providerFor = (kind: RuntimeProviderKind, hub: SandboxHub<T>): SandboxProvider<T> => {
    if (kind === "manual") return manualProvider<T>();

    return cloudProvider(kind).create(depsFor(kind, hub));
  };

  const mayHaveStopped = (runtimeId: string) =>
    cloudProviderNames().some((name) => cloudProvider(name).lifetime.mayHaveStopped(runtimeId));

  async function reachRunner(hub: SandboxHub<T>, place: RunnerPlace, offline?: string): Promise<T> {
    const connected = hub.get(place.runtimeId);

    if (connected && !mayHaveStopped(place.runtimeId)) return connected;

    const kind = await store.providerOf(place.runtimeId);

    if (!kind) {
      if (await store.isExpiredCloud(place.runtimeId))
        throw new RuntimeOfflineError(EXPIRED_COMPUTER);

      throw new RuntimeOfflineError(offline);
    }

    if (isCloudProvider(kind) && !cloudEnabled(kind)) throw new RuntimeOfflineError(CLOUD_OFF);

    return providerFor(kind, hub).start(place, offline);
  }

  async function releaseThread(hub: SandboxHub<T>, place: ThreadPlace) {
    const kind = await store.providerOf(place.runtimeId);

    if (!kind) return;

    await providerFor(kind, hub).release(place, hub.get(place.runtimeId));
  }

  async function stopCloudRuntime(runtimeId: string) {
    for (const name of cloudProviderNames()) {
      const record = await store.record({ provider: name, runtimeId, revoked: true });

      if (record) await cloudProvider(name).stop(record);
    }
  }

  async function extendCloudRuntime(runtimeId: string) {
    for (const name of cloudProviderNames()) {
      const record = await store.record({ provider: name, runtimeId, revoked: true });

      if (record) await cloudProvider(name).extend(record);
    }
  }

  return { reachRunner, releaseThread, stopCloudRuntime, extendCloudRuntime };
}
