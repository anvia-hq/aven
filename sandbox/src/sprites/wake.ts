import { UnavailableError } from "@aven/server-kit/errors";

import {
  SPRITES_BOOT_COMMAND,
  SPRITES_BOOT_PATH,
  SPRITES_BOOT_TIMEOUT_MS,
  spritesBootEnv,
} from "./boot";
import { SpritesApiError } from "./client";
import { SPRITES_HOME, spritesNameFor } from "./config";
import type { SandboxClock } from "../types";
import type { SpritesWake } from "./types";

const realClock: SandboxClock = {
  now: () => Date.now(),
  sleep: (ms) => Bun.sleep(ms),
};

const gone = (error: unknown) => error instanceof SpritesApiError && error.status === 404;

export async function wakeSpritesSandbox(input: SpritesWake) {
  const clock = input.clock ?? realClock;
  const { name, started } = await ensureSprite(input);

  if (started) input.forget?.();

  const settleMs = input.settleMs ?? (started ? 0 : 10_000);

  if (await waitFor(input.connected, clock, clock.now() + settleMs)) return { started };

  try {
    await input.client.writeFile(
      input.record.apiKey,
      name,
      SPRITES_BOOT_PATH,
      spritesBootEnv(input.runnerUrl, input.record.runnerToken, input.release),
      { mode: "0600", workingDir: SPRITES_HOME },
    );

    const booted = await input.client.run(input.record.apiKey, name, SPRITES_BOOT_COMMAND, {
      dir: SPRITES_HOME,
      timeoutMs: SPRITES_BOOT_TIMEOUT_MS,
    });

    if (booted.exitCode !== 0)
      throw new UnavailableError(
        firstLine(booted.stderr || booted.stdout) ||
          `The Sprites computer ${name} could not start the runner`,
      );
  } catch (error) {
    throw asUnavailable(error);
  }

  if (await waitFor(input.connected, clock, clock.now() + (input.connectTimeoutMs ?? 180_000)))
    return { started };

  throw new UnavailableError(
    `The Sprites computer ${name} did not connect. It has to reach ${input.runnerUrl}`,
  );
}

async function ensureSprite(input: SpritesWake) {
  const { record, client } = input;
  const wanted = record.sandboxId ?? spritesNameFor(record.runtimeId);

  try {
    const existing = await client.get(record.apiKey, wanted);
    return { name: existing.name, started: false };
  } catch (error) {
    if (!gone(error)) throw asUnavailable(error);
  }

  const created = await client.create(record.apiKey, wanted).catch((error: unknown) => {
    throw asUnavailable(error);
  });

  await input.saveSandboxId(created.name);

  return { name: created.name, started: true };
}

async function waitFor(connected: () => boolean, clock: SandboxClock, deadline: number) {
  for (let i = 0; i < 400; i++) {
    if (connected()) return true;

    if (clock.now() >= deadline) return false;

    await clock.sleep(1_000);
  }

  return connected();
}

function firstLine(text: string) {
  const line = text.split("\n").find((candidate) => candidate.trim() !== "");

  return line ? line.trim().slice(0, 240) : "";
}

function asUnavailable(error: unknown) {
  if (error instanceof UnavailableError) return error;

  if (error instanceof SpritesApiError) return new UnavailableError(error.message);

  return new UnavailableError("Could not reach api.sprites.dev");
}
