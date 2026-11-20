import { UnavailableError } from "@aven/server-kit/errors";

import { autoStopSeconds, boatApiBase, boatApiKey, BoatApiError, BoatClient } from "./client";
import { boatLifetime } from "./lifetime";
import { createBoatProvider } from "./provider";
import { removeBoatSandbox, stopBoatSandbox } from "./stop";
import type {
  CloudProviderModule,
  ProviderCapabilities,
  ProviderCredentials,
  ProviderDeps,
  SandboxRunner,
} from "../types";

const CAPABILITIES: ProviderCapabilities = {
  stopMode: "native_resume",
  supportsMaxLifetime: false,
  supportsDiskSizeQuery: false,
  defaultAutoStopSeconds: autoStopSeconds(),
};

function key(credentials?: ProviderCredentials) {
  const apiKey = credentials?.apiKey.trim() || boatApiKey();

  if (!apiKey) throw new UnavailableError("The boat API key is not set");

  return apiKey;
}

function clientFor(credentials?: ProviderCredentials) {
  return credentials ? new BoatClient(fetch, boatApiBase(credentials.base)) : new BoatClient();
}

const gone = (error: unknown) => error instanceof BoatApiError && error.status === 404;

export const boatModule: CloudProviderModule = {
  capabilities: CAPABILITIES,
  apiKey: boatApiKey,
  ready: () => boatApiKey() !== null,
  create: <T extends SandboxRunner>(deps: ProviderDeps<T>) =>
    createBoatProvider<T>({
      hub: deps.hub,
      record: deps.record,
      saveSandboxId: deps.saveSandboxId,
      clock: deps.clock,
    }),
  stop: async (record, credentials) => {
    const resolved = credentials ?? record.credentials;
    const effective = resolved ? { ...record, apiKey: resolved.apiKey } : record;
    await stopBoatSandbox(effective, clientFor(resolved));
    boatLifetime.stopped(record.runtimeId);
  },
  extend: async (record, options, credentials) => {
    if (!record.sandboxId) return;

    const resolved = credentials ?? record.credentials;
    const apiKey = resolved?.apiKey ?? record.apiKey;
    await clientFor(resolved).extend(apiKey, record.sandboxId, options?.ttlSeconds);
  },
  removeSandbox: (sandboxId, credentials) =>
    removeBoatSandbox(
      sandboxId,
      clientFor(credentials),
      credentials?.apiKey.trim() || boatApiKey(),
    ),
  saveEnvironment: async (sandboxId, name, credentials) =>
    clientFor(credentials).saveSnapshot(key(credentials), sandboxId, name),
  readEnvironment: async (name, credentials) => {
    const apiKey = credentials?.apiKey.trim() || boatApiKey();

    if (!apiKey) return null;

    return clientFor(credentials)
      .getSavedSnapshot(apiKey, name)
      .catch((error: unknown) => (gone(error) ? null : Promise.reject(error)));
  },
  removeEnvironment: async (name, credentials) => {
    const apiKey = credentials?.apiKey.trim() || boatApiKey();

    if (!apiKey) return false;

    try {
      await clientFor(credentials).deleteSavedSnapshot(apiKey, name);
      return true;
    } catch (error) {
      if (gone(error)) return true;

      throw error;
    }
  },
  lifetime: boatLifetime,
};
