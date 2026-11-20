import { UnavailableError } from "@aven/server-kit/errors";

import {
  LIZARD_BOOT_COMMAND,
  LIZARD_BOOT_PATH,
  LIZARD_BOOT_TIMEOUT_MS,
  LIZARD_FRESH_JOURNAL_COMMAND,
  lizardBootEnv,
} from "./boot";
import { LizardApiError, type LizardClient } from "./client";
import type { LizardSandbox, LizardWake } from "./types";
import type { SandboxClock } from "../types";

const READY = new Set(["running"]);

const WAITING = new Set(["creating", "starting", "provisioning", "pausing", "resuming"]);

const GONE_STATES = new Set(["stopped", "deleted", "failed"]);

const realClock: SandboxClock = {
  now: () => Date.now(),
  sleep: (ms) => Bun.sleep(ms),
};

const gone = (error: unknown) => error instanceof LizardApiError && error.status === 404;

export async function wakeLizardSandbox(input: LizardWake) {
  const clock = input.clock ?? realClock;
  const { sandboxId, started } = await ensureSandbox(input, clock, input.readyTimeoutMs ?? 75_000);

  if (started) input.forget?.();

  const settleMs = input.settleMs ?? (started ? 0 : 10_000);

  if (await waitFor(input.connected, clock, clock.now() + settleMs)) return { started };

  const { apiKey, runnerToken } = input.record;

  try {
    await input.client.writeFile(
      apiKey,
      sandboxId,
      LIZARD_BOOT_PATH,
      lizardBootEnv(input.runnerUrl, runnerToken, input.release),
    );
    await input.client.exec(apiKey, sandboxId, LIZARD_BOOT_COMMAND, {
      timeoutMs: LIZARD_BOOT_TIMEOUT_MS,
    });
  } catch (error) {
    throw asUnavailable(error);
  }

  if (await waitFor(input.connected, clock, clock.now() + (input.connectTimeoutMs ?? 180_000)))
    return { started };

  throw new UnavailableError(
    `The Lizard sandbox ${sandboxId} did not connect. It has to reach ${input.runnerUrl}`,
  );
}

async function ensureSandbox(input: LizardWake, clock: SandboxClock, readyTimeoutMs: number) {
  const { record, client } = input;

  if (record.sandboxId) {
    const existing = await prepare(client, record.apiKey, record.sandboxId, clock, readyTimeoutMs);

    if (existing) return { sandboxId: existing.id, started: existing.resumed };
  }

  let created: LizardSandbox;
  let environment = record.environment;
  const project = record.credentials?.project ?? input.project;
  const create = (from: string | null | undefined) =>
    client.createSandbox(record.apiKey, {
      runtimeId: record.runtimeId,
      machineType: record.machineType,
      from,
      project,
      region: input.region,
      template: input.template,
    });

  try {
    created = await create(environment);
  } catch (error) {
    if (!environment || !gone(error)) throw asUnavailable(error);

    environment = null;

    try {
      created = await create(null);
    } catch (fallback) {
      throw asUnavailable(fallback);
    }
  }

  await input.saveSandboxId(created.id);
  const ready = await prepare(client, record.apiKey, created.id, clock, readyTimeoutMs);

  if (!ready) throw new UnavailableError("Lizard did not keep the sandbox it created");

  if (environment) {
    try {
      await client.exec(record.apiKey, ready.id, LIZARD_FRESH_JOURNAL_COMMAND);
    } catch (error) {
      await client.deleteSandbox(record.apiKey, ready.id).catch(() => undefined);
      throw asUnavailable(error);
    }
  }

  return { sandboxId: ready.id, started: true };
}

async function prepare(
  client: LizardClient,
  apiKey: string,
  sandboxId: string,
  clock: SandboxClock,
  readyTimeoutMs: number,
) {
  let sandbox: LizardSandbox;

  try {
    sandbox = await watch(client, apiKey, sandboxId, clock, readyTimeoutMs);
  } catch (error) {
    if (gone(error)) return undefined;

    throw asUnavailable(error);
  }

  if (GONE_STATES.has(sandbox.state)) return undefined;

  const resumed = sandbox.state === "paused";

  if (resumed) {
    try {
      await client.resume(apiKey, sandboxId);
      sandbox = await watch(client, apiKey, sandboxId, clock, readyTimeoutMs);
      await client.extend(apiKey, sandboxId);
    } catch (error) {
      if (gone(error)) return undefined;

      throw asUnavailable(error);
    }
  }

  if (!READY.has(sandbox.state))
    throw new UnavailableError(
      sandbox.pauseError ||
        (sandbox.state
          ? `The Lizard sandbox is ${sandbox.state}`
          : "The Lizard sandbox did not become ready"),
    );

  return { id: sandbox.id, resumed };
}

async function watch(
  client: LizardClient,
  apiKey: string,
  sandboxId: string,
  clock: SandboxClock,
  readyTimeoutMs: number,
) {
  const deadline = clock.now() + readyTimeoutMs;
  let sandbox = await client.getSandbox(apiKey, sandboxId);

  for (let i = 0; i < 100 && WAITING.has(sandbox.state); i++) {
    if (clock.now() >= deadline) break;

    await clock.sleep(1_000);
    sandbox = await client.getSandbox(apiKey, sandboxId);
  }

  if (WAITING.has(sandbox.state))
    throw new UnavailableError(`The Lizard sandbox is still ${sandbox.state}`);

  return sandbox;
}

async function waitFor(connected: () => boolean, clock: SandboxClock, deadline: number) {
  for (let i = 0; i < 400; i++) {
    if (connected()) return true;

    if (clock.now() >= deadline) return false;

    await clock.sleep(1_000);
  }

  return connected();
}

function asUnavailable(error: unknown) {
  if (error instanceof UnavailableError) return error;

  if (error instanceof LizardApiError) return new UnavailableError(error.message);

  return new UnavailableError("Could not reach lizard.build");
}
