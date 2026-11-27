export const PREVIEW_ENTER_PATH = "/__aven/enter";

export const PREVIEW_BRIDGE_PATH = "/__aven/bridge.js";

export const PREVIEW_BRIDGE_LOCATION_EVENT = "aven:preview:location";

export const PREVIEW_BRIDGE_COMMAND_EVENT = "aven:preview:command";

export const PREVIEW_COOKIE_PREFIX = "__Host-aven-preview";

export const PREVIEW_MAX_PORT = 65535;

export const PREVIEW_MAX_PATH_LENGTH = 4096;

export const PREVIEW_DENIED_PORTS: Readonly<Record<number, string>> = {
  22: "SSH",
  111: "the port mapper",
  445: "SMB",
  631: "printing",
  1433: "SQL Server",
  1521: "Oracle",
  2375: "Docker's API",
  2376: "Docker's API",
  3306: "MySQL",
  3389: "remote desktop",
  5432: "PostgreSQL",
  5433: "PostgreSQL",
  5900: "remote desktop",
  5901: "remote desktop",
  5984: "CouchDB",
  6379: "Redis",
  9042: "Cassandra",
  11211: "memcached",
  27017: "MongoDB",
  27018: "MongoDB",
};

export function isPreviewPort(port: number) {
  return Number.isInteger(port) && port >= 1 && port <= PREVIEW_MAX_PORT;
}

export function previewPortRefusal(port: number) {
  if (!isPreviewPort(port)) return "That is not a port";

  const service = PREVIEW_DENIED_PORTS[port];

  if (service) return `Port ${port} is ${service}'s on this machine, so it is not a preview`;
}

export function normalizePreviewPath(raw?: string): string {
  if (!raw) return "/";

  const trimmed = raw.trim();

  if (
    trimmed === "" ||
    trimmed.length > PREVIEW_MAX_PATH_LENGTH ||
    /[\r\n\0]/.test(trimmed) ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  ) {
    return "/";
  }

  const candidate = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return "/";

  try {
    const parsed = new URL(candidate, "https://preview.invalid");

    if (parsed.origin !== "https://preview.invalid") return "/";

    const result = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    if (result.startsWith("//") || result.startsWith("/\\")) return "/";

    return result;
  } catch {
    return "/";
  }
}
