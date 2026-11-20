import { UnavailableError } from "@aven/server-kit/errors";

import { sandboxSettingsOf } from "../settings";
import { isRelease } from "../spaces/boot";
import type { LizardMachineType, LizardSize } from "./types";

const AUTO_STOP_SECONDS = 2 * 60 * 60;

export const LIZARD_API_BASE = "https://lizard.build";

export const LIZARD_DEFAULT_TEMPLATE = "base";

export const LIZARD_DEFAULT_REGION = "us-east-1";

export const LIZARD_STORAGE_MICROS_PER_GB_MONTH = 140_000;

const SIZE_MAP: Record<LizardMachineType, LizardSize> = {
  small: "small",
  default: "medium",
  large: "large",
  xlarge: "big",
};

const COMPUTE_MICROS_PER_HOUR: Record<LizardMachineType, number> = {
  small: 16_200,
  default: 32_400,
  large: 64_800,
  xlarge: 129_600,
};

export const lizardSizeOf = (machineType: LizardMachineType): LizardSize => SIZE_MAP[machineType];

export const lizardComputeMicrosPerHour = (machineType: LizardMachineType) =>
  COMPUTE_MICROS_PER_HOUR[machineType];

export const lizardApiKey = () => sandboxSettingsOf("lizard")?.apiKey.trim() || null;

export function lizardApiBase(configured = sandboxSettingsOf("lizard")?.base) {
  const base = (configured?.trim() || LIZARD_API_BASE).replace(/\/$/, "");

  try {
    const url = new URL(base);

    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new UnavailableError("The Lizard API address must be an http or https address");
  } catch (error) {
    throw error instanceof UnavailableError
      ? error
      : new UnavailableError("The Lizard API address must be an http or https address");
  }

  return base;
}

export const lizardConfigured = () => lizardApiKey() !== null;

export function lizardProject(configured = sandboxSettingsOf("lizard")?.project) {
  const value =
    configured?.trim() ||
    process.env.LIZARD_PROJECT_ID?.trim() ||
    process.env.LIZARD_PROJECT?.trim() ||
    "";
  return value || undefined;
}

export function lizardRegion() {
  return process.env.AVEN_LIZARD_REGION?.trim() || undefined;
}

export function lizardTemplate() {
  return process.env.AVEN_LIZARD_TEMPLATE?.trim() || LIZARD_DEFAULT_TEMPLATE;
}

export function lizardAutoStopSeconds() {
  const configured = Number(process.env.AVEN_LIZARD_AUTO_STOP_SECONDS);

  return Number.isInteger(configured) && configured >= 60 ? configured : AUTO_STOP_SECONDS;
}

export function lizardRelease(env: string | undefined = process.env.AVEN_VERSION) {
  return isRelease(env) ? env : undefined;
}

type RunnerUrlEnv = {
  BETTER_AUTH_URL?: string;
};

export function lizardRunnerUrl(
  env: RunnerUrlEnv = { BETTER_AUTH_URL: process.env.BETTER_AUTH_URL },
  explicit = sandboxSettingsOf("lizard")?.runnerUrl,
) {
  const origin = (env.BETTER_AUTH_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const raw = (explicit?.trim() || `${origin}/api`).replace(/\/$/, "");
  const message =
    "The address a Lizard sandbox uses to reach this server must be an http or https address";

  try {
    const url = new URL(raw);

    if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnavailableError(message);
  } catch (error) {
    throw error instanceof UnavailableError ? error : new UnavailableError(message);
  }

  return raw;
}
