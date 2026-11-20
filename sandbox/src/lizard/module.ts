import { UnavailableError } from "@aven/server-kit/errors";

import { LizardApiError, LizardClient } from "./client";
import { lizardApiBase, lizardApiKey, lizardAutoStopSeconds } from "./config";
import { lizardLifetime } from "./lifetime";
import { createLizardProvider } from "./provider";
import { destroyLizardSandbox, stopLizardSandbox } from "./stop";
import type {
  CloudProviderModule,
  ProviderCapabilities,
  ProviderCredentials,
  ProviderDeps,
  SandboxRunner,
} from "../types";

const CAPABILITIES: ProviderCapabilities = {
  stopMode: "native_resume",
  supportsMaxLifetime: true,
  supportsDiskSizeQuery: false,
  defaultAutoStopSeconds: lizardAutoStopSeconds(),
};

function clientFor(credentials?: ProviderCredentials) {
  return credentials
    ? new LizardClient(fetch, lizardApiBase(credentials.base))
    : new LizardClient(fetch, lizardApiBase());
}

function key(credentials?: ProviderCredentials) {
  const apiKey = credentials?.apiKey.trim() || lizardApiKey();

  if (!apiKey) throw new UnavailableError("The Lizard API key is not set");

  return apiKey;
}

const gone = (error: unknown) => error instanceof LizardApiError && error.status === 404;

export const lizardModule: CloudProviderModule = {
  capabilities: CAPABILITIES,
  apiKey: lizardApiKey,
  ready: () => lizardApiKey() !== null,
  create: <T extends SandboxRunner>(deps: ProviderDeps<T>) =>
    createLizardProvider<T>({
      hub: deps.hub,
      record: deps.record,
      saveSandboxId: deps.saveSandboxId,
      clock: deps.clock,
    }),
  stop: async (record, credentials) => {
    const resolved = credentials ?? record.credentials;
    const effective = resolved ? { ...record, apiKey: resolved.apiKey } : record;
    await stopLizardSandbox(effective, clientFor(resolved));
    lizardLifetime.stopped(record.runtimeId);
  },
  extend: async (record, options, credentials) => {
    if (!record.sandboxId) return;

    const resolved = credentials ?? record.credentials;
    const apiKey = resolved?.apiKey ?? record.apiKey;
    await clientFor(resolved).extend(apiKey, record.sandboxId, options?.ttlSeconds);
  },
  removeSandbox: async (sandboxId, credentials) => {
    const apiKey = credentials?.apiKey.trim() || lizardApiKey();

    if (!apiKey) return false;

    await destroyLizardSandbox(apiKey, sandboxId, clientFor(credentials));
    return true;
  },
  saveEnvironment: async (sandboxId, name, credentials) =>
    clientFor(credentials).saveSnapshot(key(credentials), sandboxId, name),
  readEnvironment: async (name, credentials) => {
    const apiKey = credentials?.apiKey.trim() || lizardApiKey();

    if (!apiKey) return null;

    return clientFor(credentials)
      .getSavedSnapshot(apiKey, name)
      .catch((error: unknown) => (gone(error) ? null : Promise.reject(error)));
  },
  removeEnvironment: async (name, credentials) => {
    const apiKey = credentials?.apiKey.trim() || lizardApiKey();

    if (!apiKey) return false;

    try {
      await clientFor(credentials).deleteSavedSnapshot(apiKey, name);
      return true;
    } catch (error) {
      if (gone(error)) return true;

      throw error;
    }
  },
  lifetime: lizardLifetime,
};
