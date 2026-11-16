import { UnavailableError } from "@aven/server-kit/errors";

import type { SpacesSettings } from "./types";

const AUTO_STOP_SECONDS = 2 * 60 * 60;

let saved: SpacesSettings | null = null;

export const setSpacesSettings = (settings: SpacesSettings | null) => {
  saved = settings;
};

export const spacesApiKey = () =>
  saved?.apiKey.trim() || process.env.AVEN_SPACES_API_KEY?.trim() || null;

export function spacesApiBase(configured = saved?.base ?? process.env.AVEN_SPACES_API_BASE) {
  const raw = configured?.trim();

  if (!raw) return null;

  try {
    const url = new URL(raw);

    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  } catch {
    return null;
  }

  return raw.replace(/\/$/, "");
}

export const spacesConfigured = () => spacesApiKey() !== null && spacesApiBase() !== null;

export function spacesAutoStopSeconds() {
  const configured = Number(process.env.AVEN_SPACES_AUTO_STOP_SECONDS);

  return Number.isInteger(configured) && configured >= 60 ? configured : AUTO_STOP_SECONDS;
}

type RunnerUrlEnv = {
  AVEN_SPACES_RUNNER_URL?: string;
  BETTER_AUTH_URL?: string;
};

export function spacesRunnerUrl(
  env: RunnerUrlEnv = {
    AVEN_SPACES_RUNNER_URL: process.env.AVEN_SPACES_RUNNER_URL,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  },
) {
  const explicit = saved?.runnerUrl.trim() || env.AVEN_SPACES_RUNNER_URL?.trim();
  const origin = (env.BETTER_AUTH_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const raw = (explicit || `${origin}/api`).replace(/\/$/, "");
  const message =
    "AVEN_SPACES_RUNNER_URL must be the address a spaces sandbox uses to reach this server";

  try {
    const url = new URL(raw);

    if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnavailableError(message);
  } catch (error) {
    throw error instanceof UnavailableError ? error : new UnavailableError(message);
  }

  return raw;
}
