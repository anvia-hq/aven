import { UnavailableError } from "@aven/server-kit/errors";

import { boatApiKey, BoatApiError, BoatClient } from "./client";
import { boatLifetime } from "./lifetime";
import { createBoatProvider } from "./provider";
import { removeBoatSandbox, stopBoatSandbox } from "./stop";
import type { CloudProviderModule, ProviderDeps, SandboxRunner } from "../types";

function key() {
  const apiKey = boatApiKey();

  if (!apiKey) throw new UnavailableError("The boat API key is not set");

  return apiKey;
}

const gone = (error: unknown) => error instanceof BoatApiError && error.status === 404;

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
    boatLifetime.stopped(record.runtimeId);
  },
  extend: async (record) => {
    if (!record.sandboxId) return;

    await new BoatClient().extend(record.apiKey, record.sandboxId);
  },
  removeSandbox: (sandboxId) => removeBoatSandbox(sandboxId),
  saveEnvironment: async (sandboxId, name) => new BoatClient().saveSnapshot(key(), sandboxId, name),
  readEnvironment: async (name) => {
    const apiKey = boatApiKey();

    if (!apiKey) return null;

    return new BoatClient()
      .getSavedSnapshot(apiKey, name)
      .catch((error: unknown) => (gone(error) ? null : Promise.reject(error)));
  },
  removeEnvironment: async (name) => {
    const apiKey = boatApiKey();

    if (!apiKey) return true;

    try {
      await new BoatClient().deleteSavedSnapshot(apiKey, name);
      return true;
    } catch (error) {
      if (gone(error)) return true;

      throw error;
    }
  },
  lifetime: boatLifetime,
};
