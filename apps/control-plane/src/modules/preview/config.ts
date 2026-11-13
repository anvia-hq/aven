import { createHmac } from "node:crypto";

import type { PreviewSettings } from "./types";

const DOMAIN =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

const DEFAULT_PORT = 8001;
const DEFAULT_HOSTNAME = "127.0.0.1";

export function previewDomain(value: string | undefined) {
  const domain = value?.trim().toLowerCase().replace(/\.$/, "");

  if (!domain) return undefined;

  if (domain.includes("*") || domain.includes("/") || domain.includes(":") || !DOMAIN.test(domain))
    throw new Error(
      `AVEN_PREVIEW_DOMAIN must be a domain such as aven.run, with no scheme, port or wildcard, got "${value}"`,
    );

  return domain;
}

function trustOrigins(env: Record<string, string | undefined>) {
  return [env.BETTER_AUTH_URL, ...(env.TRUSTED_ORIGINS ?? "").split(",")]
    .map((origin) => origin?.trim())
    .filter((origin): origin is string => Boolean(origin));
}

export function refusePreviewInTrustedOrigins(
  domain: string,
  env: Record<string, string | undefined>,
) {
  for (const origin of trustOrigins(env)) {
    let hostname: string;

    try {
      hostname = new URL(origin).hostname.toLowerCase();
    } catch {
      continue;
    }

    if (hostname === domain || hostname.endsWith(`.${domain}`))
      throw new Error(
        `${origin} is a preview host: hosts of ${domain} are never in TRUSTED_ORIGINS, since a page a runner serves must not run as Aven`,
      );
  }
}

export function readPreviewSettings(
  env: Record<string, string | undefined> = process.env,
): PreviewSettings {
  const domain = previewDomain(env.AVEN_PREVIEW_DOMAIN);
  const port = Number(env.AVEN_PREVIEW_PORT ?? DEFAULT_PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`AVEN_PREVIEW_PORT must be a port number, got "${env.AVEN_PREVIEW_PORT}"`);

  const hostname = env.AVEN_PREVIEW_BIND?.trim() || DEFAULT_HOSTNAME;

  if (!domain) return { domain: undefined, port, hostname, secret: new Uint8Array() };

  refusePreviewInTrustedOrigins(domain, env);

  const secret = env.BETTER_AUTH_SECRET;

  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set, so previews cannot be signed");

  return {
    domain,
    port,
    hostname,
    secret: createHmac("sha256", secret).update("aven:preview").digest(),
  };
}

let cached: PreviewSettings | undefined;

export function previewSettings() {
  return (cached ??= readPreviewSettings(process.env));
}
