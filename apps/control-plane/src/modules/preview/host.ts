import { isPreviewPort } from "@aven/protocol/preview";

import type { PreviewClaims } from "./types";

const RUNTIME_ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function previewHostPattern(domain: string) {
  return new RegExp(`^([1-9]\\d{0,4})-(${RUNTIME_ID})\\.${escape(domain)}$`);
}

export function previewHost(hostHeader: string | undefined, domain: string): PreviewClaims | null {
  if (!hostHeader) return null;

  const name = hostHeader
    .trim()
    .toLowerCase()
    .replace(/:\d{1,5}$/, "");

  if (name.includes(":")) return null;

  const match = previewHostPattern(domain).exec(name);

  if (!match) return null;

  const port = Number(match[1]);

  if (!isPreviewPort(port)) return null;

  return { port, runtimeId: match[2]! };
}

export function previewHostname(claims: PreviewClaims, domain: string) {
  return `${claims.port}-${claims.runtimeId}.${domain}`;
}
