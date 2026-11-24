import { UnavailableError } from "@aven/server-kit/errors";

import { spritesHoldCommand } from "./boot";
import { SpritesApiError, SpritesClient } from "./client";
import { spritesApiBase, spritesApiKey, spritesAutoStopSeconds } from "./config";
import { spritesLifetime } from "./lifetime";
import { createSpritesProvider } from "./provider";
import { destroySpritesSandbox, stopSpritesSandbox } from "./stop";
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
  defaultAutoStopSeconds: spritesAutoStopSeconds(),
};

const HOLD_TIMEOUT_MS = 30_000;

function clientFor(credentials?: ProviderCredentials) {
  return credentials
    ? new SpritesClient(fetch, spritesApiBase(credentials.base))
    : new SpritesClient(fetch, spritesApiBase());
}

export const spritesModule: CloudProviderModule = {
  capabilities: CAPABILITIES,
  apiKey: spritesApiKey,
  ready: () => spritesApiKey() !== null,
  create: <T extends SandboxRunner>(deps: ProviderDeps<T>) =>
    createSpritesProvider<T>({
      hub: deps.hub,
      record: deps.record,
      saveSandboxId: deps.saveSandboxId,
      clock: deps.clock,
    }),
  stop: async (record, credentials) => {
    const resolved = credentials ?? record.credentials;
    const effective = resolved ? { ...record, apiKey: resolved.apiKey } : record;
    await stopSpritesSandbox(effective, clientFor(resolved));
    spritesLifetime.stopped(record.runtimeId);
  },
  extend: async (record, options, credentials) => {
    if (!record.sandboxId) return;

    const resolved = credentials ?? record.credentials;
    const apiKey = resolved?.apiKey ?? record.apiKey;
    const seconds = Math.min(
      options?.ttlSeconds ?? CAPABILITIES.defaultAutoStopSeconds,
      CAPABILITIES.defaultAutoStopSeconds,
    );

    try {
      await clientFor(resolved).run(apiKey, record.sandboxId, spritesHoldCommand(seconds), {
        timeoutMs: HOLD_TIMEOUT_MS,
      });
    } catch (error) {
      if (!(error instanceof SpritesApiError)) throw error;

      if ([401, 403, 404, 409].includes(error.status)) {
        console.error(`Could not hold the Sprite ${record.sandboxId}: ${error.message}`);
        return;
      }

      throw new UnavailableError(error.message);
    }
  },
  removeSandbox: async (sandboxId, credentials) => {
    const apiKey = credentials?.apiKey.trim() || spritesApiKey();

    if (!apiKey) return false;

    await destroySpritesSandbox(apiKey, sandboxId, clientFor(credentials));
    return true;
  },
  saveEnvironment: async (_sandboxId, name) => ({
    name,
    status: "failed",
    error: "Sprites cannot keep an environment: a checkpoint cannot be started as a new computer",
  }),
  readEnvironment: async () => null,
  removeEnvironment: async () => true,
  lifetime: spritesLifetime,
};
