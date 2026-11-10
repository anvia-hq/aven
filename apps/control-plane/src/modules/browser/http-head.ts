import type { Head, Header } from "./types";

export const MAX_HEAD_BYTES = 64 * 1024;
export const APP_COOKIE_PREFIX = "aven-app.";
export const PAGE_COOKIE = "aven-browser";

const END = [13, 10, 13, 10];

export function headEnd(bytes: Uint8Array) {
  for (let at = 0; at + 4 <= bytes.length; at++) {
    if (END.every((byte, offset) => bytes[at + offset] === byte)) return at + 4;
  }
  return -1;
}

export function parseHead(text: string): Head | null {
  const lines = text.split("\r\n");
  const start = lines[0];
  if (!start) return null;
  const headers: Header[] = [];
  for (const line of lines.slice(1)) {
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon < 1 || /^\s/.test(line)) return null;
    headers.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  }
  return { start, headers };
}

export function serializeHead(head: Head) {
  return `${[head.start, ...head.headers.map(([name, value]) => `${name}: ${value}`)].join("\r\n")}\r\n\r\n`;
}

export function requestLine(head: Head) {
  const [method, target, version] = head.start.split(" ");
  if (!method || !target || !version?.startsWith("HTTP/1.")) return null;
  return { method, target, version };
}

const named = (header: Header, name: string) => header[0].toLowerCase() === name;

export function headerOf(head: Head, name: string) {
  return head.headers.find((header) => named(header, name))?.[1];
}

export function cookiesOf(head: Head) {
  const jar = new Map<string, string>();
  for (const [name, value] of head.headers) {
    if (name.toLowerCase() !== "cookie") continue;
    for (const pair of value.split(";")) {
      const equals = pair.indexOf("=");
      if (equals < 1) continue;
      jar.set(pair.slice(0, equals).trim(), pair.slice(equals + 1).trim());
    }
  }
  return jar;
}

const without = (head: Head, ...names: string[]) =>
  head.headers.filter((header) => !names.some((name) => named(header, name)));

const local = (port: number) => `localhost:${port}`;

function originOf(url: string, port: number) {
  try {
    return `${new URL(url).protocol}//${local(port)}`;
  } catch {
    return null;
  }
}

export function requestForPort(head: Head, port: number) {
  const upgrade = (headerOf(head, "upgrade") ?? "").toLowerCase() === "websocket";
  const app = [...cookiesOf(head)]
    .filter(([name]) => name.startsWith(APP_COOKIE_PREFIX))
    .map(([name, value]) => `${name.slice(APP_COOKIE_PREFIX.length)}=${value}`)
    .join("; ");
  const headers: Header[] = [];
  for (const header of without(
    head,
    "host",
    "cookie",
    "connection",
    "keep-alive",
    "proxy-connection",
    "proxy-authorization",
    "te",
  )) {
    const [name, value] = header;
    if (named(header, "origin") || named(header, "referer")) {
      const origin = originOf(value, port);
      if (!origin) continue;
      headers.push([name, named(header, "origin") ? origin : `${origin}${refererPath(value)}`]);
    } else headers.push(header);
  }
  headers.push(["Host", local(port)]);
  if (app) headers.push(["Cookie", app]);
  headers.push(["Connection", upgrade ? "Upgrade" : "close"]);
  return { head: { start: head.start, headers }, upgrade };
}

function refererPath(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "";
  }
}

function appCookie(value: string) {
  const [pair = "", ...attributes] = value.split(";");
  const kept = attributes.filter((attribute) => !/^\s*domain\s*=/i.test(attribute));
  return [`${APP_COOKIE_PREFIX}${pair.trimStart()}`, ...kept].join(";");
}

function relative(location: string, port: number) {
  try {
    const url = new URL(location);
    const here = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(url.hostname);
    if (here && url.port === String(port)) return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return location;
  }
  return location;
}

function withoutFrameAncestors(policy: string) {
  return policy
    .split(";")
    .filter((directive) => !/^\s*frame-ancestors(\s|$)/i.test(directive))
    .join(";")
    .trim();
}

export function responseForBrowser(head: Head, port: number): Head {
  const switching = head.start.split(" ")[1] === "101";
  const headers: Header[] = [];
  for (const header of without(
    head,
    "connection",
    "keep-alive",
    "x-frame-options",
    "strict-transport-security",
    "clear-site-data",
  )) {
    const [name, value] = header;
    if (named(header, "set-cookie")) headers.push([name, appCookie(value)]);
    else if (named(header, "location")) headers.push([name, relative(value, port)]);
    else if (
      named(header, "content-security-policy") ||
      named(header, "content-security-policy-report-only")
    ) {
      const policy = withoutFrameAncestors(value);
      if (policy) headers.push([name, policy]);
    } else headers.push(header);
  }
  if (!switching) headers.push(["Connection", "close"]);
  else headers.push(["Connection", "Upgrade"]);
  return { start: head.start, headers };
}
