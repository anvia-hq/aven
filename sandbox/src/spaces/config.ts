import { UnavailableError } from "@aven/server-kit/errors";

import { sandboxSettingsOf } from "../settings";

const AUTO_STOP_SECONDS = 2 * 60 * 60;

export const spacesApiKey = () => sandboxSettingsOf("spaces")?.apiKey.trim() || null;

export function spacesApiBase(configured = sandboxSettingsOf("spaces")?.base) {
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
  BETTER_AUTH_URL?: string;
};

export function spacesRunnerUrl(
  env: RunnerUrlEnv = { BETTER_AUTH_URL: process.env.BETTER_AUTH_URL },
  explicit = sandboxSettingsOf("spaces")?.runnerUrl,
) {
  const origin = (env.BETTER_AUTH_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const raw = (explicit?.trim() || `${origin}/api`).replace(/\/$/, "");
  const message =
    "The address a spaces sandbox uses to reach this server must be an http or https address";

  try {
    const url = new URL(raw);

    if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnavailableError(message);
  } catch (error) {
    throw error instanceof UnavailableError ? error : new UnavailableError(message);
  }

  return raw;
}
