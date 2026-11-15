import { boatApiKey, BoatClient } from "./client";
import { boatLifetime } from "./lifetime";
import { createBoatProvider } from "./provider";
import { removeBoatSandbox, stopBoatSandbox } from "./stop";
import type { CloudProviderModule, ProviderDeps, SandboxRunner } from "../types";

export const boatModule: CloudProviderModule = {
  apiKey: boatApiKey,
  ready: () => boatApiKey() !== null,
  create: <T extends SandboxRunner>(deps: ProviderDeps<T>) =>
    createBoatProvider<T>({
      hub: deps.hub,
      record: deps.record,
      saveSandboxId: deps.saveSandboxId,
      clock: deps.clock,
    }),
  stop: async (record) => {
    await stopBoatSandbox(record, new BoatClient());
  },
  removeSandbox: (sandboxId) => removeBoatSandbox(sandboxId),
  lifetime: boatLifetime,
};
