import { BoatClient } from "./boat/client";
import { boatLifetime } from "./boat/lifetime";
import { cloudEnabled, isCloudProvider } from "./cloud-config";
import { createBoatProvider } from "./boat/provider";
import { createSpacesProvider } from "./spaces/provider";
import { spacesLifetime } from "./spaces/lifetime";
import { stopBoatSandbox } from "./boat/stop";
import { RuntimeOfflineError, type RuntimeHub } from "./hub";
import { CLOUD_OFF, runtimesService } from "./service";
import type { RuntimeProviderKind } from "@aven/protocol/types";
import type { RunnerPlace, RuntimeProvider, ThreadPlace } from "./types";

const RELEASE_TIMEOUT_MS = 30_000;

export const EXPIRED_COMPUTER =
  "This Aven Cloud computer was deleted after 48 hours without use. Continue the thread to start a new one";

export const manualProvider: RuntimeProvider = {
  kind: "manual",
  async start(_place, offline) {
    throw new RuntimeOfflineError(offline);
  },
  async release(place, runner) {
    if (!runner) return;

    await runner.call("sandbox.release", { threadId: place.threadId }, RELEASE_TIMEOUT_MS);
  },
};

type ProviderHub = Pick<RuntimeHub, "get"> & Partial<Pick<RuntimeHub, "disconnect">>;

function spacesProvider(hub: ProviderHub) {
  return createSpacesProvider({
    hub,
    load: (runtimeId, revoked) => runtimesService.spacesRecord(runtimeId, revoked),
    saveSandboxId: (runtimeId, sandboxId) => runtimesService.setBoatSandbox(runtimeId, sandboxId),
  });
}

const providers: Record<RuntimeProviderKind, (hub: ProviderHub) => RuntimeProvider> = {
  manual: () => manualProvider,
  boat: (hub) =>
    createBoatProvider({
      hub,
      load: (runtimeId) => runtimesService.boatRecord(runtimeId),
      saveSandboxId: (runtimeId, sandboxId) => runtimesService.setBoatSandbox(runtimeId, sandboxId),
    }),
  spaces: (hub) => spacesProvider(hub),
};

export async function reachRunner(hub: ProviderHub, place: RunnerPlace, offline?: string) {
  const connected = hub.get(place.runtimeId);

  if (
    connected &&
    !boatLifetime.mayHaveStopped(place.runtimeId) &&
    !spacesLifetime.mayHaveStopped(place.runtimeId)
  )
    return connected;

  const kind = await runtimesService.providerOf(place.runtimeId);

  if (!kind) {
    if (await runtimesService.isExpiredCloud(place.runtimeId))
      throw new RuntimeOfflineError(EXPIRED_COMPUTER);

    throw new RuntimeOfflineError(offline);
  }

  if (isCloudProvider(kind) && !cloudEnabled(kind)) throw new RuntimeOfflineError(CLOUD_OFF);

  return providers[kind](hub).start(place, offline);
}

export async function releaseThread(hub: Pick<RuntimeHub, "get">, place: ThreadPlace) {
  const kind = await runtimesService.providerOf(place.runtimeId);

  if (!kind) return;

  await providers[kind](hub).release(place, hub.get(place.runtimeId));
}

export async function stopBoatRuntime(runtimeId: string, fetchFn: typeof fetch = fetch) {
  const record = await runtimesService.boatRecord(runtimeId, true);

  if (!record) return;

  await stopBoatSandbox(record, new BoatClient(fetchFn));
}

export async function stopCloudRuntime(runtimeId: string, fetchFn: typeof fetch = fetch) {
  await stopBoatRuntime(runtimeId, fetchFn);
  await spacesProvider({ get: () => undefined }).stop(runtimeId);
}

export const destroySpacesSandbox = (sandboxId: string) =>
  spacesProvider({ get: () => undefined }).destroy(sandboxId);
