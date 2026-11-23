import type { PreviewTarget } from "./types";

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

export function addressOf(port: number, target?: PreviewTarget) {
  if (target?.previewDomain) return `https://${port}-${target.runtimeId}.${target.previewDomain}`;

  return `http://localhost:${port}`;
}
