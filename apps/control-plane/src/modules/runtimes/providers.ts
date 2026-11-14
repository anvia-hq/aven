import { BoatClient } from "./boat/client";
import { createBoatProvider } from "./boat/provider";
import { stopBoatSandbox } from "./boat/stop";
import { RuntimeOfflineError, type RuntimeHub } from "./hub";
import { runtimesService } from "./service";
import type { RuntimeProviderKind } from "@aven/protocol/types";
import type { RunnerPlace, RuntimeProvider, ThreadPlace } from "./types";

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

const providers: Record<RuntimeProviderKind, (hub: Pick<RuntimeHub, "get">) => RuntimeProvider> = {
  manual: () => manualProvider,
  boat: (hub) =>
    createBoatProvider({
      hub,
      load: (runtimeId) => runtimesService.boatRecord(runtimeId),
      saveSandboxId: (runtimeId, sandboxId) => runtimesService.setBoatSandbox(runtimeId, sandboxId),
    }),
};

export async function reachRunner(
  hub: Pick<RuntimeHub, "get">,
  place: RunnerPlace,
  offline?: string,
) {
  const connected = hub.get(place.runtimeId);

  if (connected) return connected;

  const kind = await runtimesService.providerOf(place.runtimeId);

  if (!kind) throw new RuntimeOfflineError(offline);

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
