import { UnavailableError } from "@aven/server-kit/errors";

import { SpacesClient } from "./client";
import { spacesApiBase, spacesApiKey } from "./config";
import { spacesLifetime } from "./lifetime";
import { createSpacesProvider } from "./provider";
import { destroySpacesSandbox, stopSpacesSandbox } from "./stop";
import type { CloudProviderModule, ProviderDeps, SandboxRunner } from "../types";

function client() {
  const base = spacesApiBase();

  if (!base) throw new UnavailableError("The spaces server address is not set");

  return new SpacesClient(base);
}

export const spacesModule: CloudProviderModule = {
  apiKey: spacesApiKey,
  ready: () => spacesApiKey() !== null && spacesApiBase() !== null,
  create: <T extends SandboxRunner>(deps: ProviderDeps<T>) =>
    createSpacesProvider<T>({
      hub: deps.hub,
      record: deps.record,
      saveSandboxId: deps.saveSandboxId,
      clock: deps.clock,
    }),
  stop: async (record) => {
    await stopSpacesSandbox(record, client());
  },
  removeSandbox: async (sandboxId) => {
    const apiKey = spacesApiKey();

    if (!apiKey) throw new UnavailableError("The spaces API key is not set");

    await destroySpacesSandbox(apiKey, sandboxId, client());

    return true;
  },
  lifetime: spacesLifetime,
};
