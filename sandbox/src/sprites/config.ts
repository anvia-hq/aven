import { UnavailableError } from "@aven/server-kit/errors";

import { sandboxSettingsOf } from "../settings";
import { isRelease } from "../spaces/boot";

const AUTO_STOP_SECONDS = 60 * 60;

const MIN_AUTO_STOP_SECONDS = 60;

const VCPUS = 8;

const MEMORY_GB = 8;

const MICROS_PER_DOLLAR = 1_000_000;

const CPU_MICROS_PER_VCPU_HOUR = 38_500;

const MEMORY_MICROS_PER_GB_HOUR = 21_875;

export const SPRITES_API_BASE = "https://api.sprites.dev";

export const SPRITES_HOLD_NAME = "aven";

export const SPRITES_HOME = "/home/sprite";

export const SPRITES_WORKSPACE = `${SPRITES_HOME}/workspace`;

export const SPRITES_COMPUTE_MICROS_PER_HOUR =
  VCPUS * CPU_MICROS_PER_VCPU_HOUR + MEMORY_GB * MEMORY_MICROS_PER_GB_HOUR;

export const SPRITES_STORAGE_MICROS_PER_GB_MONTH = Math.round(0.5 * MICROS_PER_DOLLAR);

export const spritesApiKey = () => sandboxSettingsOf("sprites")?.apiKey.trim() || null;

export const spritesConfigured = () => spritesApiKey() !== null;

export function spritesApiBase(configured = sandboxSettingsOf("sprites")?.base) {
  const base = (configured?.trim() || SPRITES_API_BASE).replace(/\/$/, "");
  const message = "The Sprites API address must be an http or https address";

  try {
    const url = new URL(base);

    if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnavailableError(message);
  } catch (error) {
    throw error instanceof UnavailableError ? error : new UnavailableError(message);
  }

  return base;
}

export function spritesNameFor(runtimeId: string) {
  const digits = runtimeId.replace(/[^A-Za-z0-9]/g, "").toLowerCase();

  return `aven-${digits.slice(0, 24) || "computer"}`;
}

export function spritesAutoStopSeconds() {
  const configured = Number(process.env.AVEN_SPRITES_AUTO_STOP_SECONDS);

  if (!Number.isInteger(configured)) return AUTO_STOP_SECONDS;

  return Math.min(Math.max(configured, MIN_AUTO_STOP_SECONDS), AUTO_STOP_SECONDS);
}

export function spritesRelease(env: string | undefined = process.env.AVEN_VERSION) {
  return isRelease(env) ? env : undefined;
}

type RunnerUrlEnv = {
  BETTER_AUTH_URL?: string;
};

export function spritesRunnerUrl(
  env: RunnerUrlEnv = { BETTER_AUTH_URL: process.env.BETTER_AUTH_URL },
  explicit = sandboxSettingsOf("sprites")?.runnerUrl,
) {
  const origin = (env.BETTER_AUTH_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const raw = (explicit?.trim() || `${origin}/api`).replace(/\/$/, "");
  const message =
    "The address a Sprites computer uses to reach this server must be an http or https address";

  try {
    const url = new URL(raw);

    if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnavailableError(message);
  } catch (error) {
    throw error instanceof UnavailableError ? error : new UnavailableError(message);
  }

  return raw;
}
