import { UnavailableError } from "@aven/server-kit/errors";

import { SpacesApiError, SpacesClient } from "./client";
import { spacesApiBase, spacesApiKey, spacesAutoStopSeconds } from "./config";
import { spacesLifetime } from "./lifetime";
import { createSpacesProvider } from "./provider";
import { destroySpacesSandbox, stopSpacesSandbox } from "./stop";
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
  defaultAutoStopSeconds: spacesAutoStopSeconds(),
};

function baseOf(credentials?: ProviderCredentials) {
  const configured = credentials?.base.trim().replace(/\/$/, "");
  return configured || spacesApiBase();
}

function clientFor(credentials?: ProviderCredentials) {
  const base = baseOf(credentials);

  if (!base) throw new UnavailableError("The spaces server address is not set");

  return new SpacesClient(base);
}

function key(credentials?: ProviderCredentials) {
  const apiKey = credentials?.apiKey.trim() || spacesApiKey();

  if (!apiKey) throw new UnavailableError("The spaces API key is not set");

  return apiKey;
}

const gone = (error: unknown) => error instanceof SpacesApiError && error.status === 404;

export const spacesModule: CloudProviderModule = {
  capabilities: CAPABILITIES,
  apiKey: spacesApiKey,
  ready: () => spacesApiKey() !== null && spacesApiBase() !== null,
  create: <T extends SandboxRunner>(deps: ProviderDeps<T>) =>
    createSpacesProvider<T>({
      hub: deps.hub,
      record: deps.record,
      saveSandboxId: deps.saveSandboxId,
      clock: deps.clock,
    }),
  stop: async (record, credentials) => {
    const resolved = credentials ?? record.credentials;
    const effective = resolved ? { ...record, apiKey: resolved.apiKey } : record;
    await stopSpacesSandbox(effective, clientFor(resolved));
    spacesLifetime.stopped(record.runtimeId);
  },
  extend: async (record, options, credentials) => {
    if (!record.sandboxId) return;

    const resolved = credentials ?? record.credentials;
    const apiKey = resolved?.apiKey ?? record.apiKey;
    await clientFor(resolved).extend(apiKey, record.sandboxId, options?.ttlSeconds);
  },
  removeSandbox: async (sandboxId, credentials) => {
    const apiKey = credentials?.apiKey.trim() || spacesApiKey();
    const base = baseOf(credentials);

    if (!apiKey || !base) return false;

    await destroySpacesSandbox(apiKey, sandboxId, new SpacesClient(base));
    return true;
  },
  saveEnvironment: async (sandboxId, name, credentials) =>
    clientFor(credentials).saveSnapshot(key(credentials), sandboxId, name),
  readEnvironment: async (name, credentials) => {
    const apiKey = credentials?.apiKey.trim() || spacesApiKey();
    const base = baseOf(credentials);

    if (!apiKey || !base) return null;

    return new SpacesClient(base)
      .getSavedSnapshot(apiKey, name)
      .catch((error: unknown) => (gone(error) ? null : Promise.reject(error)));
  },
  removeEnvironment: async (name, credentials) => {
    const apiKey = credentials?.apiKey.trim() || spacesApiKey();
    const base = baseOf(credentials);

    if (!apiKey || !base) return false;

    try {
      await new SpacesClient(base).deleteSavedSnapshot(apiKey, name);
      return true;
    } catch (error) {
      if (gone(error)) return true;

      throw error;
    }
  },
  lifetime: spacesLifetime,
};
