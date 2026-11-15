import { RuntimeOfflineError } from "../offline";
import type { RuntimeConnection } from "../hub";
import { BoatClient } from "./client";
import { runnerUrlFromEnv } from "./runner-url";
import { wakeBoatSandbox } from "./wake";
import type { RuntimeProvider, ThreadPlace } from "../types";
import type { BoatClock, BoatWakeRecord } from "./types";

const RELEASE_TIMEOUT_MS = 30_000;

const inflight = new Map<string, Promise<RuntimeConnection>>();

type Deps = {
  hub: Pick<{ get(runtimeId: string): RuntimeConnection | undefined }, "get">;
  load: (runtimeId: string) => Promise<BoatWakeRecord | null>;
  saveSandboxId: (runtimeId: string, sandboxId: string) => Promise<void>;
  fetchFn?: typeof fetch;
  runnerUrl?: () => string;
  client?: BoatClient;
  clock?: BoatClock;
};

export function createBoatProvider(deps: Deps): RuntimeProvider {
  const client = deps.client ?? new BoatClient(deps.fetchFn);
  const runnerUrl = deps.runnerUrl ?? (() => runnerUrlFromEnv());
  return {
    kind: "boat",
    start(place, offline) {
      const running = inflight.get(place.runtimeId);

      if (running) return running;

      const waking = wake(deps, client, runnerUrl, place.runtimeId, offline).finally(() => {
        if (inflight.get(place.runtimeId) === waking) inflight.delete(place.runtimeId);
      });
      inflight.set(place.runtimeId, waking);
      return waking;
    },
    async release(place: ThreadPlace, runner: RuntimeConnection | undefined) {
      if (!runner) return;

      await runner.call("sandbox.release", { threadId: place.threadId }, RELEASE_TIMEOUT_MS);
    },
  };
}

async function wake(
  deps: Deps,
  client: BoatClient,
  runnerUrl: () => string,
  runtimeId: string,
  offline?: string,
) {
  const record = await deps.load(runtimeId);

  if (!record) throw new RuntimeOfflineError(offline);

  await wakeBoatSandbox({
    record,
    client,
    runnerUrl: runnerUrl(),
    saveSandboxId: (sandboxId) => deps.saveSandboxId(runtimeId, sandboxId),
    connected: () => deps.hub.get(runtimeId) !== undefined,
    clock: deps.clock,
  });
  const connection = deps.hub.get(runtimeId);

  if (!connection) throw new RuntimeOfflineError(offline);

  return connection;
}
