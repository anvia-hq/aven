import type { ServerWebSocket } from "bun";

import type { PreviewProxyHandle, PreviewProxyOptions, ProxyRoute } from "./types";

const LOOPBACK_HOSTS = ["127.0.0.1", "[::1]"] as const;

const VITE_ASSET_PREFIXES = ["/@", "/src/", "/node_modules/", "/__vite"];

const HOP_BY_HOP_REQUEST = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const HOP_BY_HOP_RESPONSE = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
]);

type WsState = {
  port: number;
  path: string;
  protocols: string[];
  upstream?: WebSocket;
  queue: Array<string | ArrayBuffer>;
  closed: boolean;
};

export function parseProxyPort(raw: string | undefined, flag: string): number {
  if (!raw) throw new Error(`--${flag} is required`);

  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--${flag} must be a port between 1 and 65535`);
  }

  return port;
}

export function parseProxyRoutes(spec: string | undefined): ProxyRoute[] {
  if (!spec || !spec.trim()) return [];

  const routes: ProxyRoute[] = [];
  for (const rawEntry of spec.split(",")) {
    const entry = rawEntry.trim();

    if (!entry) continue;

    const eq = entry.lastIndexOf("=");

    if (eq < 1) throw new Error(`Invalid --route "${entry}": expected /prefix=port`);

    const rawPrefix = entry.slice(0, eq).trim();
    const prefix = rawPrefix.startsWith("/") ? rawPrefix : `/${rawPrefix}`;
    const port = parseProxyPort(entry.slice(eq + 1).trim(), "route");
    routes.push({ prefix, port });
  }
  return routes.sort((a, b) => b.prefix.length - a.prefix.length);
}

function matchesPrefix(pathname: string, prefix: string) {
  if (pathname === prefix) return true;

  if (prefix.endsWith("/")) return pathname.startsWith(prefix);

  return pathname.startsWith(`${prefix}/`);
}

function isViteAsset(pathname: string) {
  return VITE_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function selectProxyTarget(
  pathname: string,
  secFetchDest: string | null,
  options: { webPort: number; apiPort?: number; routes: readonly ProxyRoute[] },
): { port: number; isApi: boolean } {
  for (const route of options.routes) {
    if (matchesPrefix(pathname, route.prefix)) return { port: route.port, isApi: true };
  }

  if (
    options.apiPort !== undefined &&
    secFetchDest?.toLowerCase() === "empty" &&
    !isViteAsset(pathname)
  ) {
    return { port: options.apiPort, isApi: true };
  }

  return { port: options.webPort, isApi: false };
}

function upstreamRequestHeaders(
  incoming: Headers,
  targetPort: number,
  isApi: boolean,
  originOverride: string,
) {
  const headers = new Headers();
  incoming.forEach((value, name) => {
    const lower = name.toLowerCase();

    if (HOP_BY_HOP_REQUEST.has(lower) || lower === "host") return;

    if (lower === "origin" && isApi) {
      headers.set(name, originOverride);
      return;
    }

    headers.append(name, value);
  });
  headers.set("host", `localhost:${targetPort}`);
  return headers;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

function rewriteLocation(value: string, ports: ReadonlySet<number>) {
  try {
    const parsed = new URL(value);
    const defaultPort = parsed.protocol === "https:" ? 443 : 80;
    const port = parsed.port ? Number(parsed.port) : defaultPort;

    if (LOCAL_HOSTS.has(parsed.hostname) && ports.has(port)) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return value;
  }

  return value;
}

function downstreamResponseHeaders(upstream: Headers, localPorts: ReadonlySet<number>) {
  const headers = new Headers();
  upstream.forEach((value, name) => {
    const lower = name.toLowerCase();

    if (HOP_BY_HOP_RESPONSE.has(lower) || lower === "set-cookie") return;

    if (lower === "location") {
      headers.append(name, rewriteLocation(value, localPorts));
      return;
    }

    headers.append(name, value);
  });
  for (const cookie of upstream.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  return headers;
}

async function fetchLoopback(
  port: number,
  pathAndSearch: string,
  init: RequestInit,
): Promise<Response> {
  let lastError: unknown;
  for (const host of LOOPBACK_HOSTS) {
    try {
      return await fetch(`http://${host}:${port}${pathAndSearch}`, init);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function safeCloseCode(code: number) {
  if (code === 1000 || (code >= 3000 && code <= 4999)) return code;

  return 1000;
}

function connectUpstreamWebSocket(ws: ServerWebSocket<WsState>, hostIndex = 0) {
  const state = ws.data;

  if (state.closed || hostIndex >= LOOPBACK_HOSTS.length) {
    ws.close(1011, "Upstream unavailable");
    return;
  }

  const host = LOOPBACK_HOSTS[hostIndex]!;
  let opened = false;
  const upstream =
    state.protocols.length > 0
      ? new WebSocket(`ws://${host}:${state.port}${state.path}`, state.protocols)
      : new WebSocket(`ws://${host}:${state.port}${state.path}`);
  upstream.binaryType = "arraybuffer";
  state.upstream = upstream;

  upstream.addEventListener("open", () => {
    opened = true;

    if (state.closed) {
      upstream.close();
      return;
    }

    for (const queued of state.queue.splice(0)) upstream.send(queued);
  });

  upstream.addEventListener("message", (event) => {
    if (state.closed) return;

    const payload = event.data;

    if (typeof payload === "string" || payload instanceof ArrayBuffer) {
      ws.send(payload);
    }
  });

  upstream.addEventListener("error", () => {
    if (!opened && !state.closed) {
      connectUpstreamWebSocket(ws, hostIndex + 1);
    }
  });

  upstream.addEventListener("close", (event) => {
    if (!opened && !state.closed) return;

    if (!state.closed) ws.close(safeCloseCode(event.code), event.reason);
  });
}

export function startPreviewProxyServer(options: PreviewProxyOptions): PreviewProxyHandle {
  const routes = options.routes
    ? [...options.routes].sort((a, b) => b.prefix.length - a.prefix.length)
    : [];
  const originOverride = options.origin ?? `http://localhost:${options.webPort}`;
  const localPorts = new Set<number>([options.webPort]);

  if (options.apiPort !== undefined) localPorts.add(options.apiPort);

  for (const route of routes) localPorts.add(route.port);

  const server = Bun.serve<WsState>({
    hostname: options.bind ?? "127.0.0.1",
    port: options.port,
    async fetch(req, srv) {
      const url = new URL(req.url);
      const pathAndSearch = `${url.pathname}${url.search}`;
      const target = selectProxyTarget(url.pathname, req.headers.get("sec-fetch-dest"), {
        webPort: options.webPort,
        apiPort: options.apiPort,
        routes,
      });

      if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const protocols = (req.headers.get("sec-websocket-protocol") ?? "")
          .split(",")
          .flatMap((entry) => {
            const trimmed = entry.trim();
            return trimmed ? [trimmed] : [];
          });
        const upgraded = srv.upgrade(req, {
          data: {
            port: target.port,
            path: pathAndSearch,
            protocols,
            queue: [],
            closed: false,
          },
          headers: protocols.length > 0 ? { "sec-websocket-protocol": protocols[0]! } : undefined,
        });
        return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
      }

      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const body = hasBody ? await req.arrayBuffer() : undefined;
      try {
        const upstream = await fetchLoopback(target.port, pathAndSearch, {
          method: req.method,
          headers: upstreamRequestHeaders(req.headers, target.port, target.isApi, originOverride),
          body,
          redirect: "manual",
        });
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: downstreamResponseHeaders(upstream.headers, localPorts),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return new Response(`Upstream port ${target.port} unreachable: ${detail}`, { status: 502 });
      }
    },
    websocket: {
      open(ws) {
        connectUpstreamWebSocket(ws, 0);
      },
      message(ws, message) {
        const payload =
          typeof message === "string"
            ? message
            : message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength);

        if (ws.data.upstream && ws.data.upstream.readyState === WebSocket.OPEN) {
          ws.data.upstream.send(payload);
        } else {
          ws.data.queue.push(payload);
        }
      },
      close(ws, code, reason) {
        ws.data.closed = true;
        ws.data.upstream?.close(safeCloseCode(code), reason);
      },
    },
  });

  return {
    port: server.port ?? options.port,
    stop() {
      void server.stop(true);
    },
  };
}
