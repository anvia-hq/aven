import { UnavailableError } from "@aven/server-kit/errors";

import { FRESH_JOURNAL_COMMAND } from "../fresh-journal";
import {
  SPACES_BOOT_COMMAND,
  SPACES_BOOT_PATH,
  SPACES_BOOT_TIMEOUT_SECONDS,
  spacesBootEnv,
} from "./boot";
import { SpacesApiError, type SpacesClient } from "./client";
import type { SpacesSandbox, SpacesWake } from "./types";
import type { SandboxClock } from "../types";

const READY = new Set(["ready", "idle", "running"]);

const WAITING = new Set(["init", "provisioning", "provisioned", "cloning", "archiving"]);

const realClock: SandboxClock = {
  now: () => Date.now(),
  sleep: (ms) => Bun.sleep(ms),
};

const gone = (error: unknown) => error instanceof SpacesApiError && error.status === 404;

export async function wakeSpacesSandbox(input: SpacesWake) {
  const clock = input.clock ?? realClock;
  const { sandboxId, started } = await ensureSandbox(input, clock, input.readyTimeoutMs ?? 75_000);

  if (started) input.forget?.();

  const settleMs = input.settleMs ?? (started ? 0 : 10_000);

  if (await waitFor(input.connected, clock, clock.now() + settleMs)) return { started };

  const { apiKey, runnerToken } = input.record;

  try {
    await input.client.command(apiKey, sandboxId, "mkdir -p /home/user/.aven");
    await input.client.writeFile(
      apiKey,
      sandboxId,
      SPACES_BOOT_PATH,
      spacesBootEnv(input.runnerUrl, runnerToken),
    );
    await input.client.command(apiKey, sandboxId, SPACES_BOOT_COMMAND, {
      detached: true,
      timeoutSeconds: SPACES_BOOT_TIMEOUT_SECONDS,
    });
  } catch (error) {
    throw asUnavailable(error);
  }

  if (await waitFor(input.connected, clock, clock.now() + (input.connectTimeoutMs ?? 180_000)))
    return { started };

  throw new UnavailableError(
    `The spaces sandbox ${sandboxId} did not connect. It has to reach ${input.runnerUrl}`,
  );
}

async function ensureSandbox(input: SpacesWake, clock: SandboxClock, readyTimeoutMs: number) {
  const { record, client } = input;

  if (record.sandboxId) {
    const existing = await prepare(client, record.apiKey, record.sandboxId, clock, readyTimeoutMs);

    if (existing) return { sandboxId: existing.id, started: existing.resumed };
  }

  let created: SpacesSandbox;

  try {
    created = await client.createSandbox(record.apiKey, {
      runtimeId: record.runtimeId,
      machineType: record.machineType,
      from: record.environment,
    });
  } catch (error) {
    throw asUnavailable(error);
  }

  await input.saveSandboxId(created.id);
  const ready = await prepare(client, record.apiKey, created.id, clock, readyTimeoutMs);

  if (!ready) throw new UnavailableError("Spaces did not keep the sandbox it created");

  if (record.environment) {
    try {
      await client.command(record.apiKey, ready.id, FRESH_JOURNAL_COMMAND);
    } catch (error) {
      throw asUnavailable(error);
    }
  }

  return { sandboxId: ready.id, started: true };
}

async function prepare(
  client: SpacesClient,
  apiKey: string,
  sandboxId: string,
  clock: SandboxClock,
  readyTimeoutMs: number,
) {
  let sandbox: SpacesSandbox;

  try {
    sandbox = await watch(client, apiKey, sandboxId, clock, readyTimeoutMs);
  } catch (error) {
    if (gone(error)) return undefined;

    throw asUnavailable(error);
  }

  if (sandbox.state === "cancelled") return undefined;

  const resumed = sandbox.state === "archived" || sandbox.state === "error";

  if (resumed) {
    try {
      await client.resume(apiKey, sandboxId);
      sandbox = await watch(client, apiKey, sandboxId, clock, readyTimeoutMs);
    } catch (error) {
      if (gone(error)) return undefined;

      throw asUnavailable(error);
    }
  }

  if (!READY.has(sandbox.state))
    throw new UnavailableError(
      sandbox.state
        ? `The spaces sandbox is ${sandbox.state}`
        : "The spaces sandbox did not become ready",
    );

  return { id: sandbox.id, resumed };
}

async function watch(
  client: SpacesClient,
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
    throw new UnavailableError(`The spaces sandbox is still ${sandbox.state}`);

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

  if (error instanceof SpacesApiError) return new UnavailableError(error.message);

  return new UnavailableError("Could not reach the spaces server");
}
