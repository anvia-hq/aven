import { normalizePreviewPath } from "@aven/protocol/preview";

import type { PreviewAddress, PreviewTarget } from "./types";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

function validPort(digits: string) {
  if (!/^\d{1,5}$/.test(digits)) return null;

  const port = Number(digits);
  return port >= 1 && port <= 65535 ? port : null;
}

export function parsePort(text: string, target?: PreviewTarget) {
  const bare = text
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");

  if (target?.previewDomain) {
    const suffix = `-${target.runtimeId}.${target.previewDomain}`.toLowerCase();
    const lower = bare.toLowerCase();

    if (lower.endsWith(suffix)) {
      return validPort(lower.slice(0, -suffix.length));
    }
  }

  const separator = bare.lastIndexOf(":");
  const host = separator > 0 ? bare.slice(0, separator).toLowerCase() : "";
  const digits = separator >= 0 ? bare.slice(separator + 1) : bare;

  if (host !== "" && !LOCAL_HOSTS.has(host)) return null;

  return validPort(digits);
}

export function parseAddress(
  text: string,
  target?: PreviewTarget,
  currentPort?: number,
): PreviewAddress | null {
  const trimmed = text.trim();

  if (trimmed === "") return null;

  if (trimmed.startsWith("/")) {
    if (currentPort === undefined) return null;

    return { port: currentPort, path: normalizePreviewPath(trimmed) };
  }

  const withoutScheme = trimmed.replace(/^https?:\/\//i, "");
  const slash = withoutScheme.indexOf("/");
  const hostPort = slash >= 0 ? withoutScheme.slice(0, slash) : withoutScheme;
  const rawPath = slash >= 0 ? withoutScheme.slice(slash) : "/";
  const port = parsePort(hostPort, target);

  if (port === null) return null;

  return { port, path: normalizePreviewPath(rawPath) };
}

export function originOf(port: number, target?: PreviewTarget) {
  if (target?.previewDomain) return `https://${port}-${target.runtimeId}.${target.previewDomain}`;

  return `http://localhost:${port}`;
}

export function addressOf(port: number, target?: PreviewTarget, path = "/") {
  const origin = originOf(port, target);
  const normalized = normalizePreviewPath(path);
  return normalized === "/" ? origin : `${origin}${normalized}`;
}
