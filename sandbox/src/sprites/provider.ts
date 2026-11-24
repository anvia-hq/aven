import { UnavailableError } from "@aven/server-kit/errors";

import { RuntimeOfflineError } from "../offline";
import { SpritesClient } from "./client";
import {
  spritesApiBase,
  spritesApiKey,
  spritesAutoStopSeconds,
  spritesRelease,
  spritesRunnerUrl,
} from "./config";
import { spritesLifetime } from "./lifetime";
import { destroySpritesSandbox, stopSpritesSandbox } from "./stop";
import { wakeSpritesSandbox } from "./wake";
import type { SandboxRunner, ThreadPlace } from "../types";
import type { SpritesProvider, SpritesProviderDeps } from "./types";

const RELEASE_TIMEOUT_MS = 30_000;

const inflight = new Map<string, Promise<unknown>>();

function defaultClient() {
  return new SpritesClient(fetch, spritesApiBase());
}

export function createSpritesProvider<T extends SandboxRunner>(
  deps: SpritesProviderDeps<T>,
): SpritesProvider<T> {
  const clientOf = deps.client ?? defaultClient;
  const runnerUrl = deps.runnerUrl ?? spritesRunnerUrl;
  const release = deps.release ?? spritesRelease;

  async function wake(runtimeId: string, offline?: string) {
    const record = await deps.record({ runtimeId });

    if (!record) throw new RuntimeOfflineError(offline);

    const client = record.credentials?.base
      ? new SpritesClient(fetch, spritesApiBase(record.credentials.base))
      : clientOf();
    const resolvedRunnerUrl = record.credentials?.runnerUrl
      ? spritesRunnerUrl(undefined, record.credentials.runnerUrl)
      : runnerUrl();
    const { started } = await wakeSpritesSandbox({
      record,
      client,
      runnerUrl: resolvedRunnerUrl,
      release: release(),
      saveSandboxId: (sandboxId) => deps.saveSandboxId(runtimeId, sandboxId),
      connected: () => deps.hub.get(runtimeId) !== undefined,
      forget: () => deps.hub.disconnect?.(runtimeId, "The computer was stopped and started again"),
      clock: deps.clock,
    });
    spritesLifetime.woke(runtimeId, started, spritesAutoStopSeconds() * 1000);
    const connection = deps.hub.get(runtimeId);

    if (!connection) throw new RuntimeOfflineError(offline);

    return connection;
  }

  return {
    kind: "sprites",
    start(place, offline) {
      const running = inflight.get(place.runtimeId);

      if (running) return running as Promise<T>;

      const waking = wake(place.runtimeId, offline).finally(() => {
        if (inflight.get(place.runtimeId) === waking) inflight.delete(place.runtimeId);
      });
      inflight.set(place.runtimeId, waking);
      return waking;
    },
    async release(place: ThreadPlace, runner: T | undefined) {
      if (!runner) return;

      await runner.call("sandbox.release", { threadId: place.threadId }, RELEASE_TIMEOUT_MS);
    },
    async stop(runtimeId) {
      const record = await deps.record({ runtimeId, revoked: true });

      if (record) await stopSpritesSandbox(record, clientOf());
    },
    async destroy(sandboxId) {
      const apiKey = (deps.apiKey ?? spritesApiKey)();

      if (!apiKey) throw new UnavailableError("The Sprites API token is not set");

      await destroySpritesSandbox(apiKey, sandboxId, clientOf());
    },
  };
}
