import {
  PREVIEW_BRIDGE_COMMAND_EVENT,
  PREVIEW_BRIDGE_LOCATION_EVENT,
  PREVIEW_BRIDGE_PATH,
} from "@aven/protocol/preview";

import { headerOf, requestLine } from "./http-head";
import type { Head } from "./types";

export const PREVIEW_BRIDGE_TAG = `<script src="${PREVIEW_BRIDGE_PATH}" defer></script>`;

export const PREVIEW_BRIDGE_TAG_BYTES = Buffer.from(PREVIEW_BRIDGE_TAG, "utf8");

export function previewBridgeScript(appOrigins: readonly string[] = []): string {
  const origins = JSON.stringify(appOrigins);
  const locationEvent = JSON.stringify(PREVIEW_BRIDGE_LOCATION_EVENT);
  const commandEvent = JSON.stringify(PREVIEW_BRIDGE_COMMAND_EVENT);
  return `(() => {
  if (window.parent === window || window.__avenPreviewBridge) return;
  window.__avenPreviewBridge = true;
  const origins = ${origins};
  let targetOrigin = origins.length === 1 ? origins[0] : "*";
  let lastPath = null;
  const currentPath = () => location.pathname + location.search + location.hash;
  const report = (force) => {
    const path = currentPath();
    if (!force && path === lastPath) return;
    lastPath = path;
    const nav = window.navigation;
    const canGoBack = nav && typeof nav.canGoBack === "boolean" ? nav.canGoBack : history.length > 1;
    const canGoForward = nav && typeof nav.canGoForward === "boolean" ? nav.canGoForward : false;
    try {
      window.parent.postMessage(
        { type: ${locationEvent}, path, canGoBack, canGoForward },
        targetOrigin,
      );
    } catch {}
  };
  const wrapHistory = (method) => {
    const original = history[method];
    if (typeof original !== "function") return;
    history[method] = function (...args) {
      const result = original.apply(this, args);
      report(false);
      return result;
    };
  };
  wrapHistory("pushState");
  wrapHistory("replaceState");
  window.addEventListener("popstate", () => report(true));
  window.addEventListener("hashchange", () => report(true));
  window.addEventListener("pageshow", () => report(true));
  if (window.navigation && typeof window.navigation.addEventListener === "function") {
    window.navigation.addEventListener("currententrychange", () => report(false));
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    if (origins.length > 0 && !origins.includes(event.origin)) return;
    if (origins.includes(event.origin)) targetOrigin = event.origin;
    const data = event.data;
    if (!data || data.type !== ${commandEvent}) return;
    if (data.action === "sync") report(true);
    else if (data.action === "back") history.back();
    else if (data.action === "forward") history.forward();
    else if (data.action === "reload") location.reload();
    else if (
      data.action === "navigate" &&
      typeof data.path === "string" &&
      data.path.startsWith("/") &&
      !data.path.startsWith("//") &&
      !data.path.startsWith("/\\\\")
    ) {
      location.assign(data.path);
    }
  });
  report(true);
})();`;
}

export function isEmbedDocumentRequest(head: Head, embed: boolean): boolean {
  if (!embed) return false;

  const line = requestLine(head);

  if (!line || line.method !== "GET") return false;

  if ((headerOf(head, "upgrade") ?? "").toLowerCase() === "websocket") return false;

  const dest = headerOf(head, "sec-fetch-dest")?.toLowerCase();

  if (dest) return dest === "iframe" || dest === "document";

  const accept = headerOf(head, "accept")?.toLowerCase() ?? "";
  return accept.includes("text/html");
}

export function shouldInjectBridge(responseHead: Head, embedDocument: boolean): boolean {
  if (!embedDocument) return false;

  const status = Number(responseHead.start.split(" ")[1] ?? "");

  if (!Number.isInteger(status) || status < 200 || status >= 300) return false;

  if (status === 204 || status === 205 || status === 206) return false;

  const contentType = headerOf(responseHead, "content-type")?.toLowerCase() ?? "";

  if (!/^text\/html(?:\s*;|$)/.test(contentType.trim())) return false;

  const encoding = headerOf(responseHead, "content-encoding")?.toLowerCase().trim();

  if (encoding && encoding !== "identity") return false;

  return true;
}

const CRLF = [13, 10];

function indexOfCrlf(bytes: Uint8Array): number {
  for (let i = 0; i + 2 <= bytes.length; i++) {
    if (bytes[i] === CRLF[0] && bytes[i + 1] === CRLF[1]) return i;
  }

  return -1;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;

  if (b.length === 0) return a;

  const joined = new Uint8Array(a.length + b.length);
  joined.set(a);
  joined.set(b, a.length);
  return joined;
}

const latin1 = new TextDecoder("latin1");

export class ChunkedTailInjector {
  #tail: Uint8Array;
  #emit: (bytes: Uint8Array) => void;
  #state: "size" | "data" | "passthrough" = "size";
  #buffer: Uint8Array = new Uint8Array(0);
  #remaining = 0;

  constructor(tail: Uint8Array, emit: (bytes: Uint8Array) => void) {
    this.#tail = tail;
    this.#emit = emit;
  }

  push(chunk: Uint8Array) {
    if (chunk.length === 0) return;

    if (this.#state === "passthrough") {
      this.#emit(chunk);
      return;
    }

    let cursor: Uint8Array = chunk;

    while (cursor.length > 0) {
      if (this.#state === "passthrough") {
        this.#emit(cursor);
        return;
      }

      if (this.#state === "data") {
        const take = Math.min(cursor.length, this.#remaining);
        this.#emit(cursor.subarray(0, take));
        this.#remaining -= take;
        cursor = cursor.subarray(take);

        if (this.#remaining === 0) this.#state = "size";

        continue;
      }

      this.#buffer = concatBytes(this.#buffer, cursor);
      cursor = new Uint8Array(0);
      const lineEnd = indexOfCrlf(this.#buffer);

      if (lineEnd < 0) return;

      const lineBytes = this.#buffer.subarray(0, lineEnd + 2);
      const rest = this.#buffer.subarray(lineEnd + 2);
      this.#buffer = new Uint8Array(0);

      const rawLine = latin1.decode(lineBytes.subarray(0, lineEnd));
      const sizeToken = rawLine.split(";")[0]?.trim() ?? "";
      const size = /^[0-9a-f]+$/i.test(sizeToken) ? Number.parseInt(sizeToken, 16) : Number.NaN;

      if (!Number.isFinite(size) || size < 0) {
        this.#state = "passthrough";
        this.#emit(lineBytes);
        cursor = rest;
        continue;
      }

      if (size === 0) {
        const prefix = Buffer.from(`${this.#tail.length.toString(16)}\r\n`, "latin1");
        const suffix = Buffer.from("\r\n", "latin1");
        this.#emit(prefix);
        this.#emit(this.#tail);
        this.#emit(suffix);
        this.#emit(lineBytes);
        this.#state = "passthrough";
        cursor = rest;
        continue;
      }

      this.#emit(lineBytes);
      this.#remaining = size + 2;
      this.#state = "data";
      cursor = rest;
    }
  }

  flush() {
    if (this.#buffer.length > 0) {
      const leftover = this.#buffer;
      this.#buffer = new Uint8Array(0);
      this.#emit(leftover);
    }
  }
}
