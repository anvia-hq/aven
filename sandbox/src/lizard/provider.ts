import { UnavailableError } from "@aven/server-kit/errors";

import { RuntimeOfflineError } from "../offline";
import { LizardClient } from "./client";
import {
  lizardApiBase,
  lizardApiKey,
  lizardAutoStopSeconds,
  lizardProject,
  lizardRegion,
  lizardRelease,
  lizardRunnerUrl,
  lizardTemplate,
} from "./config";
import { lizardLifetime } from "./lifetime";
import { destroyLizardSandbox, stopLizardSandbox } from "./stop";
import { wakeLizardSandbox } from "./wake";
import type { SandboxRunner, ThreadPlace } from "../types";
import type { LizardProvider, LizardProviderDeps } from "./types";

const RELEASE_TIMEOUT_MS = 30_000;

const inflight = new Map<string, Promise<unknown>>();

function defaultClient() {
  return new LizardClient(fetch, lizardApiBase());
}

export function createLizardProvider<T extends SandboxRunner>(
  deps: LizardProviderDeps<T>,
): LizardProvider<T> {
  const clientOf = deps.client ?? defaultClient;
  const runnerUrl = deps.runnerUrl ?? lizardRunnerUrl;
  const project = deps.project ?? lizardProject;
  const region = deps.region ?? lizardRegion;
  const template = deps.template ?? lizardTemplate;
  const release = deps.release ?? lizardRelease;

  async function wake(runtimeId: string, offline?: string) {
    const record = await deps.record({ runtimeId });

    if (!record) throw new RuntimeOfflineError(offline);

    const resolvedBase = record.credentials?.base
      ? lizardApiBase(record.credentials.base)
      : undefined;
    const client = resolvedBase ? new LizardClient(fetch, resolvedBase) : clientOf();
    const resolvedRunnerUrl = record.credentials?.runnerUrl
      ? lizardRunnerUrl(undefined, record.credentials.runnerUrl)
      : runnerUrl();
    const { started } = await wakeLizardSandbox({
      record,
      client,
      runnerUrl: resolvedRunnerUrl,
      project: record.credentials?.project || project(),
      region: region(),
      template: template(),
      release: release(),
      saveSandboxId: (sandboxId) => deps.saveSandboxId(runtimeId, sandboxId),
      connected: () => deps.hub.get(runtimeId) !== undefined,
      forget: () => deps.hub.disconnect?.(runtimeId, "The computer was stopped and started again"),
      clock: deps.clock,
    });
    lizardLifetime.woke(runtimeId, started, lizardAutoStopSeconds() * 1000);
    const connection = deps.hub.get(runtimeId);

    if (!connection) throw new RuntimeOfflineError(offline);

    return connection;
  }

  return {
    kind: "lizard",
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

      if (record) await stopLizardSandbox(record, clientOf());
    },
    async destroy(sandboxId) {
      const apiKey = (deps.apiKey ?? lizardApiKey)();

      if (!apiKey) throw new UnavailableError("The Lizard API key is not set");

      await destroyLizardSandbox(apiKey, sandboxId, clientOf());
    },
  };
}
