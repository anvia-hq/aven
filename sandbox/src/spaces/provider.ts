import { UnavailableError } from "@aven/server-kit/errors";

import { RuntimeOfflineError } from "../offline";
import { SpacesClient } from "./client";
import { spacesApiBase, spacesApiKey, spacesAutoStopSeconds, spacesRunnerUrl } from "./config";
import { spacesLifetime } from "./lifetime";
import { destroySpacesSandbox, stopSpacesSandbox } from "./stop";
import { wakeSpacesSandbox } from "./wake";
import type { ProviderDeps, SandboxRunner, ThreadPlace } from "../types";
import type { SpacesProvider } from "./types";

const RELEASE_TIMEOUT_MS = 30_000;

const inflight = new Map<string, Promise<unknown>>();

export type SpacesProviderDeps<T extends SandboxRunner> = ProviderDeps<T> & {
  apiKey?: () => string | null;
  client?: () => SpacesClient;
  runnerUrl?: () => string;
};

function defaultClient() {
  const base = spacesApiBase();

  if (!base) throw new UnavailableError("The spaces server address is not set");

  return new SpacesClient(base);
}

export function createSpacesProvider<T extends SandboxRunner>(
  deps: SpacesProviderDeps<T>,
): SpacesProvider<T> {
  const clientOf = deps.client ?? defaultClient;
  const runnerUrl = deps.runnerUrl ?? spacesRunnerUrl;

  async function wake(runtimeId: string, offline?: string) {
    const record = await deps.record({ runtimeId });

    if (!record) throw new RuntimeOfflineError(offline);

    const { started } = await wakeSpacesSandbox({
      record,
      client: clientOf(),
      runnerUrl: runnerUrl(),
      saveSandboxId: (sandboxId) => deps.saveSandboxId(runtimeId, sandboxId),
      connected: () => deps.hub.get(runtimeId) !== undefined,
      forget: () => deps.hub.disconnect?.(runtimeId, "The computer was stopped and started again"),
      clock: deps.clock,
    });
    spacesLifetime.woke(runtimeId, started, spacesAutoStopSeconds() * 1000);
    const connection = deps.hub.get(runtimeId);

    if (!connection) throw new RuntimeOfflineError(offline);

    return connection;
  }

  return {
    kind: "spaces",
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

      if (record) await stopSpacesSandbox(record, clientOf());
    },
    async destroy(sandboxId) {
      const apiKey = (deps.apiKey ?? spacesApiKey)();

      if (!apiKey) throw new UnavailableError("The spaces API key is not set");

      await destroySpacesSandbox(apiKey, sandboxId, clientOf());
    },
  };
}
