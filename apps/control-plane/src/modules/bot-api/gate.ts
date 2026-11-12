import type { BotApiMethod } from "@aven/protocol/types";

import type { ApiTier } from "./types";

const BLOCKED: RegExp[] = [
  /^\/auth(\/|$)/i,
  /\/auth\//i,
  /^\/platform(\/|$)/,
  /^\/runtimes\/gateway(\/|$)/,
  /^\/runtimes\/connect$/,
  /^\/workload-identity(\/|$)/,
  /^\/mcp(\/|$)/,
  /^\/mcp-access(\/|$)/,
  /^\/github\/(connect|callback|app)(\/|$)/,
  /\/events$/,
  /\/terminal(\/|$)/,
  /\/artifacts\/[^/]+$/,
  /^\/users\/[^/]+\/avatar$/,
].map((pattern) => new RegExp(pattern.source, "i"));

const BLOCKED_WRITES: { method: BotApiMethod; path: RegExp }[] = [
  { method: "POST", path: /^\/runtimes\/?$/i },
  { method: "POST", path: /^\/runtimes\/[^/]+\/rotate$/i },
  { method: "PUT", path: /^\/(projects\/[^/]+\/)?variables(\/(personal|workspace))?\/[^/]+$/i },
  { method: "PUT", path: /^\/decision-model\/?$/i },
];

const CONFIRM: { method: BotApiMethod; path: RegExp }[] = [
  { method: "POST", path: /^\/threads\/[^/]+\/ship$/i },
  { method: "POST", path: /^\/runtimes\/[^/]+\/update$/i },
];

const SECRET_KEY =
  /(api[-_]?key|token|secret|password|passwd|authorization|credential|private[-_]?key)/i;

const isSecretKey = (key: string) => SECRET_KEY.test(key) && !/hint$/i.test(key);

const namesSecret = (entry: object) => {
  const { name, value } = entry as { name?: unknown; value?: unknown };
  return typeof name === "string" && isSecretKey(name) && typeof value === "string" && value !== "";
};

export class BotApiRefusal extends Error {}

export function normalizePath(raw: string) {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    throw new BotApiRefusal("The path must start with a single /, like /threads");
  }

  const url = new URL(raw, "http://aven.internal");

  if (url.origin !== "http://aven.internal") throw new BotApiRefusal("Use a path, not an address");

  let segments: string[];
  try {
    segments = url.pathname.split("/").map(decodeURIComponent);
  } catch {
    throw new BotApiRefusal("The path is not valid");
  }

  if (segments.some((part) => part.includes("/") || part.includes("\\") || part === "..")) {
    throw new BotApiRefusal("The path cannot hold a slash inside a part, or go up");
  }

  const kept = segments.filter((part, index) => part !== "" || index === 0);
  const path = kept.length > 1 ? kept.join("/") : "/";
  const sent = kept.length > 1 ? kept.map(encodeURIComponent).join("/") : "/";
  return { path, sent, search: url.search };
}

export function classify(method: BotApiMethod, path: string): ApiTier {
  if (BLOCKED.some((pattern) => pattern.test(path))) return "blocked";

  if (method === "GET") return "read";

  if (BLOCKED_WRITES.some((rule) => rule.method === method && rule.path.test(path))) {
    return "blocked";
  }

  if (method === "DELETE") return "confirm";

  if (CONFIRM.some((rule) => rule.method === method && rule.path.test(path))) return "confirm";

  return "change";
}

export function holdsSecret(body: unknown): boolean {
  if (Array.isArray(body)) return body.some(holdsSecret);

  if (body === null || typeof body !== "object") return false;

  if (namesSecret(body)) return true;

  return Object.entries(body).some(
    ([key, value]) =>
      (isSecretKey(key) && typeof value === "string" && value !== "") || holdsSecret(value),
  );
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);

  if (value === null || typeof value !== "object") return value;

  const hidden = namesSecret(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      typeof inner === "string" && (isSecretKey(key) || (hidden && key === "value"))
        ? "[hidden]"
        : redact(inner),
    ]),
  );
}
