import { UnavailableError } from "@aven/server-kit/errors";

import { SpacesApiError, SpacesClient } from "./client";
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

function key() {
  const apiKey = spacesApiKey();

  if (!apiKey) throw new UnavailableError("The spaces API key is not set");

  return apiKey;
}

const gone = (error: unknown) => error instanceof SpacesApiError && error.status === 404;

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
    spacesLifetime.stopped(record.runtimeId);
  },
  extend: async (record) => {
    if (!record.sandboxId) return;

    await client().extend(record.apiKey, record.sandboxId);
  },
  removeSandbox: async (sandboxId) => {
    const apiKey = spacesApiKey();

    if (!apiKey) throw new UnavailableError("The spaces API key is not set");

    await destroySpacesSandbox(apiKey, sandboxId, client());

    return true;
  },
  saveEnvironment: async (sandboxId, name) => client().saveSnapshot(key(), sandboxId, name),
  readEnvironment: async (name) => {
    const apiKey = spacesApiKey();

    if (!apiKey) return null;

    return client()
      .getSavedSnapshot(apiKey, name)
      .catch((error: unknown) => (gone(error) ? null : Promise.reject(error)));
  },
  removeEnvironment: async (name) => {
    const apiKey = spacesApiKey();

    if (!apiKey || !spacesApiBase()) return true;

    try {
      await client().deleteSavedSnapshot(apiKey, name);
      return true;
    } catch (error) {
      if (gone(error)) return true;

      throw error;
    }
  },
  lifetime: spacesLifetime,
};
