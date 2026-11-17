import { RuntimeOfflineError } from "../offline";
import { autoStopSeconds, BoatClient } from "./client";
import { boatLifetime } from "./lifetime";
import { boatRunnerUrl } from "./runner-url";
import { stopBoatSandbox } from "./stop";
import { wakeBoatSandbox } from "./wake";
import type { CloudSandboxProvider, ProviderDeps, SandboxRunner, ThreadPlace } from "../types";

const RELEASE_TIMEOUT_MS = 30_000;

const inflight = new Map<string, Promise<unknown>>();

export type BoatProviderDeps<T extends SandboxRunner> = ProviderDeps<T> & {
  client?: BoatClient;
  runnerUrl?: () => string;
  fetchFn?: typeof fetch;
};

export function createBoatProvider<T extends SandboxRunner>(
  deps: BoatProviderDeps<T>,
): CloudSandboxProvider<T> {
  const client = deps.client ?? new BoatClient(deps.fetchFn);
  const runnerUrl = deps.runnerUrl ?? boatRunnerUrl;

  return {
    kind: "boat",
    start(place, offline) {
      const running = inflight.get(place.runtimeId);

      if (running) return running as Promise<T>;

      const waking = wake(deps, client, runnerUrl, place.runtimeId, offline).finally(() => {
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

      if (record) await stopBoatSandbox(record, client);
    },
  };
}

async function wake<T extends SandboxRunner>(
  deps: BoatProviderDeps<T>,
  client: BoatClient,
  runnerUrl: () => string,
  runtimeId: string,
  offline?: string,
): Promise<T> {
  const record = await deps.record({ runtimeId });

  if (!record) throw new RuntimeOfflineError(offline);

  const { started } = await wakeBoatSandbox({
    record,
    client,
    runnerUrl: runnerUrl(),
    saveSandboxId: (sandboxId) => deps.saveSandboxId(runtimeId, sandboxId),
    connected: () => deps.hub.get(runtimeId) !== undefined,
    forget: () => deps.hub.disconnect?.(runtimeId, "The computer was stopped and started again"),
    clock: deps.clock,
  });
  boatLifetime.woke(runtimeId, started, autoStopSeconds() * 1000);
  const connection = deps.hub.get(runtimeId);

  if (!connection) throw new RuntimeOfflineError(offline);

  return connection;
}
