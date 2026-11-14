import { UnavailableError } from "@aven/server-kit/errors";

import { BOAT_BOOT_COMMAND, BOAT_BOOT_PATH, runnerBootEnv } from "./boot";
import { BoatApiError, type BoatClient } from "./client";
import type { BoatClock, BoatSandbox, BoatWakeRecord } from "./types";

const READY = new Set(["ready", "idle", "running"]);

const WAITING = new Set(["init", "provisioning", "provisioned", "cloning", "archiving"]);

const realClock: BoatClock = {
  now: () => Date.now(),
  sleep: (ms) => Bun.sleep(ms),
};

function gone(error: unknown) {
  return (
    error instanceof BoatApiError &&
    (error.status === 404 || error.code === "snapshot_data_expired")
  );
}

export async function wakeBoatSandbox(input: {
  record: BoatWakeRecord;
  client: BoatClient;
  runnerUrl: string;
  saveSandboxId: (sandboxId: string) => Promise<void>;
  connected: () => boolean;
  clock?: BoatClock;
  readyTimeoutMs?: number;
  settleMs?: number;
  connectTimeoutMs?: number;
}) {
  const clock = input.clock ?? realClock;
  const readyTimeoutMs = input.readyTimeoutMs ?? 75_000;
  const settleMs = input.settleMs ?? 10_000;
  const connectTimeoutMs = input.connectTimeoutMs ?? 120_000;
  const sandboxId = await ensureSandbox(input, clock, readyTimeoutMs);

  if (await waitFor(input.connected, clock, clock.now() + settleMs)) return;

  await input.client.command(input.record.apiKey, sandboxId, "mkdir -p /home/user/.aven");
  await input.client.writeFile(
    input.record.apiKey,
    sandboxId,
    BOAT_BOOT_PATH,
    runnerBootEnv(input.runnerUrl, input.record.runnerToken),
  );
  await input.client.command(input.record.apiKey, sandboxId, BOAT_BOOT_COMMAND, true);

  if (await waitFor(input.connected, clock, clock.now() + connectTimeoutMs)) return;

  throw new UnavailableError(
    `The boat sandbox ${sandboxId} did not connect. It has to reach ${input.runnerUrl}`,
  );
}

async function ensureSandbox(
  input: {
    record: BoatWakeRecord;
    client: BoatClient;
    saveSandboxId: (sandboxId: string) => Promise<void>;
  },
  clock: BoatClock,
  readyTimeoutMs: number,
) {
  if (input.record.sandboxId) {
    const existing = await prepare(
      input.client,
      input.record.apiKey,
      input.record.sandboxId,
      clock,
      readyTimeoutMs,
    );

    if (existing) return existing;
  }

  let created: BoatSandbox;

  try {
    created = await input.client.createSandbox(input.record.apiKey, {
      runtimeId: input.record.runtimeId,
      machineType: input.record.machineType,
    });
  } catch (error) {
    throw asUnavailable(error);
  }

  await input.saveSandboxId(created.id);
  const ready = await prepare(input.client, input.record.apiKey, created.id, clock, readyTimeoutMs);

  if (!ready) throw new UnavailableError("Boat did not keep the sandbox it created");

  return ready;
}

async function prepare(
  client: BoatClient,
  apiKey: string,
  sandboxId: string,
  clock: BoatClock,
  readyTimeoutMs: number,
) {
  let sandbox: BoatSandbox;

  try {
    sandbox = await watch(client, apiKey, sandboxId, clock, readyTimeoutMs);
  } catch (error) {
    if (gone(error)) return undefined;

    throw asUnavailable(error);
  }

  if (sandbox.dataExpiredAt || sandbox.state === "cancelled") return undefined;

  if (sandbox.state === "archived" || sandbox.state === "error") {
    try {
      await client.resume(apiKey, sandboxId);
    } catch (error) {
      if (gone(error)) return undefined;

      throw asUnavailable(error);
    }

    try {
      sandbox = await watch(client, apiKey, sandboxId, clock, readyTimeoutMs);
    } catch (error) {
      throw asUnavailable(error);
    }
  }

  if (!READY.has(sandbox.state))
    throw new UnavailableError(
      sandbox.state
        ? `The boat sandbox is ${sandbox.state}`
        : "The boat sandbox did not become ready",
    );

  return sandbox.id;
}

async function watch(
  client: BoatClient,
  apiKey: string,
  sandboxId: string,
  clock: BoatClock,
  readyTimeoutMs: number,
) {
  const deadline = clock.now() + readyTimeoutMs;
  let sandbox = await client.getSandbox(apiKey, sandboxId);

  for (let i = 0; i < 100 && WAITING.has(sandbox.state); i++) {
    if (clock.now() >= deadline) break;

    await clock.sleep(2_000);
    sandbox = await client.getSandbox(apiKey, sandboxId);
  }

  if (WAITING.has(sandbox.state))
    throw new UnavailableError(`The boat sandbox is still ${sandbox.state}`);

  return sandbox;
}

async function waitFor(connected: () => boolean, clock: BoatClock, deadline: number) {
  for (let i = 0; i < 200; i++) {
    if (connected()) return true;

    if (clock.now() >= deadline) return false;

    await clock.sleep(1_000);
  }

  return connected();
}

function asUnavailable(error: unknown) {
  if (error instanceof UnavailableError) return error;

  if (error instanceof BoatApiError) return new UnavailableError(error.message);

  return new UnavailableError("Could not reach boat.dev");
}
