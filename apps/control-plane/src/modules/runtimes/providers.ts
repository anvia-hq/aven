import { RuntimeOfflineError, type RuntimeHub } from "./hub";
import { runtimesService } from "./service";
import type { RuntimeProviderKind } from "@aven/protocol/types";
import type { ProviderOf, RunnerPlace, RuntimeProvider } from "./types";

export const manualProvider: RuntimeProvider = {
  kind: "manual",
  async start(_place, offline) {
    throw new RuntimeOfflineError(offline);
  },
};

const PROVIDERS: Record<RuntimeProviderKind, RuntimeProvider> = { manual: manualProvider };

export async function reachRunner(
  hub: Pick<RuntimeHub, "get">,
  place: RunnerPlace,
  offline?: string,
  providerOf: ProviderOf = (id) => runtimesService.providerOf(id),
) {
  const connected = hub.get(place.runtimeId);
  if (connected) return connected;
  const kind = await providerOf(place.runtimeId);
  if (!kind) throw new RuntimeOfflineError(offline);
  return PROVIDERS[kind].start(place, offline);
}
