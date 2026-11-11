import { RuntimeOfflineError, type RuntimeHub } from "./hub";
import { runtimesService } from "./service";
import type { RuntimeProviderKind } from "@aven/protocol/types";
import type { ProviderOf, RunnerPlace, RuntimeProvider, ThreadPlace } from "./types";

const RELEASE_TIMEOUT_MS = 30_000;

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

const PROVIDERS: Record<RuntimeProviderKind, RuntimeProvider> = { manual: manualProvider };

const recordedProvider: ProviderOf = (id) => runtimesService.providerOf(id);

export async function reachRunner(
  hub: Pick<RuntimeHub, "get">,
  place: RunnerPlace,
  offline?: string,
  providerOf: ProviderOf = recordedProvider,
) {
  const connected = hub.get(place.runtimeId);
  if (connected) return connected;
  const kind = await providerOf(place.runtimeId);
  if (!kind) throw new RuntimeOfflineError(offline);
  return PROVIDERS[kind].start(place, offline);
}

export async function releaseThread(
  hub: Pick<RuntimeHub, "get">,
  place: ThreadPlace,
  providerOf: ProviderOf = recordedProvider,
) {
  const kind = await providerOf(place.runtimeId);
  if (!kind) return;
  await PROVIDERS[kind].release(place, hub.get(place.runtimeId));
}
