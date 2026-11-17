import { UnavailableError } from "@aven/server-kit/errors";

import { sandboxSettingsOf } from "../settings";

type Env = {
  BETTER_AUTH_URL?: string;
};

function unreachable(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1"
  )
    return true;

  if (host.includes(":"))
    return host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd");

  const parts = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);

  if (!parts) return false;

  const a = Number(parts[1]);
  const b = Number(parts[2]);

  if (a === 10 || a === 127 || a === 0) return true;

  if (a === 169 && b === 254) return true;

  if (a === 172 && b >= 16 && b <= 31) return true;

  if (a === 192 && b === 168) return true;

  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

export function boatRunnerUrl(
  env: Env = { BETTER_AUTH_URL: process.env.BETTER_AUTH_URL },
  configured = sandboxSettingsOf("boat")?.runnerUrl,
) {
  const explicit = configured?.trim();
  const origin = (env.BETTER_AUTH_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const raw = (explicit || `${origin}/api`).replace(/\/$/, "");
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new UnavailableError(
      "The address a boat sandbox uses to reach this server must be a public http or https address",
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new UnavailableError(
      "The address a boat sandbox uses to reach this server must be a public http or https address",
    );

  if (unreachable(url.hostname))
    throw new UnavailableError(
      "A boat sandbox cannot reach this server. Set a public address for it in Settings > Sandbox",
    );

  return raw;
}
