import type { Socket } from "bun";

import {
  MAX_HEAD_BYTES,
  PAGE_COOKIE,
  cookiesOf,
  headEnd,
  parseHead,
  requestForPort,
  requestLine,
  responseForBrowser,
  serializeHead,
} from "./http-head";
import { signBrowserToken, verifyBrowserToken } from "./token";
import type { BrowserProxyOptions, BrowserClaims } from "./types";
import type { ViewerHandle } from "../runtimes/types";

export const ENTER_PATH = "/__aven/enter";
export const PAGE_TTL_MS = 60 * 60 * 1000;

const HEAD_TIMEOUT_SECONDS = 30;
const MAX_EARLY_BYTES = 1024 * 1024;
const MAX_QUEUED_BYTES = 8 * 1024 * 1024;

const latin1 = new TextDecoder("latin1");
const text = (value: string) => Buffer.from(value, "latin1");

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const concat = (a: Uint8Array, b: Uint8Array) => {
  const joined = new Uint8Array(a.length + b.length);
  joined.set(a);
  joined.set(b, a.length);
  return joined;
};

class Relay {
  #socket: Socket<Relay>;
  #options: BrowserProxyOptions;
  #request: Uint8Array = new Uint8Array(0);
  #response: Uint8Array = new Uint8Array(0);
  #early: Uint8Array[] = [];
  #earlyBytes = 0;
  #queued: Uint8Array[] = [];
  #queuedBytes = 0;
  #handle: ViewerHandle | undefined;
  #claims: BrowserClaims | undefined;
  #routed = false;
  #answered = false;
  #finishing = false;
  #closed = false;

  constructor(socket: Socket<Relay>, options: BrowserProxyOptions) {
    this.#socket = socket;
    this.#options = options;
  }

  receive(bytes: Uint8Array) {
    if (this.#routed) {
      this.#toApp(bytes);
      return;
    }
    this.#request = concat(this.#request, bytes);
    const end = headEnd(this.#request);
    if (end < 0) {
      if (this.#request.length > MAX_HEAD_BYTES) this.#reply(431, "The request is too large");
      return;
    }
    this.#routed = true;
    this.#socket.timeout(0);
    this.#route(this.#request.subarray(0, end), this.#request.subarray(end));
  }

  drained() {
    while (this.#queued.length > 0) {
      const chunk = this.#queued[0]!;
      const taken = this.#socket.write(chunk);
      if (taken < chunk.length) {
        this.#queued[0] = chunk.subarray(taken);
        this.#queuedBytes -= taken;
        return;
      }
      this.#queued.shift();
      this.#queuedBytes -= chunk.length;
    }
    if (this.#finishing) this.#socket.end();
  }

  closed() {
    this.#closed = true;
    this.#handle?.close();
  }

  #route(headBytes: Uint8Array, rest: Uint8Array) {
    const head = parseHead(latin1.decode(headBytes));
    const line = head && requestLine(head);
    if (!head || !line || !line.target.startsWith("/")) {
      this.#reply(400, "This is not a request the Browser can carry");
      return;
    }
    const url = new URL(line.target, "http://browser.invalid");
    if (url.pathname === ENTER_PATH) {
      this.#enter(line.method, url.searchParams.get("ticket") ?? "");
      return;
    }
    const page = cookiesOf(head).get(PAGE_COOKIE);
    const claims = page ? verifyBrowserToken(this.#options.secret, "page", page) : null;
    if (!claims) {
      this.#reply(401, "Open the Browser again from the thread: this page's link has expired.");
      return;
    }
    this.#claims = claims;
    const { head: forwarded } = requestForPort(head, claims.port);
    const first = concat(text(serializeHead(forwarded)), rest);
    this.#options
      .open(claims, {
        data: (bytes) => this.#fromApp(bytes),
        closed: (reason) => this.#appClosed(reason),
      })
      .then(
        (handle) => {
          if (this.#closed) return handle.close();
          this.#handle = handle;
          handle.write(first);
          for (const early of this.#early) handle.write(early);
          this.#early = [];
        },
        (error: unknown) =>
          this.#reply(502, error instanceof Error ? error.message : "The Browser could not open"),
      );
  }

  #enter(method: string, ticket: string) {
    const claims =
      method === "GET" ? verifyBrowserToken(this.#options.secret, "ticket", ticket) : null;
    if (!claims) {
      this.#reply(403, "This link has expired. Open the Browser again from the thread.");
      return;
    }
    const page = signBrowserToken(this.#options.secret, "page", claims, PAGE_TTL_MS);
    const attributes = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${PAGE_TTL_MS / 1000}${this.#options.secure ? "; Secure" : ""}`;
    this.#answer(
      `HTTP/1.1 302 Found\r\nLocation: /\r\nSet-Cookie: ${PAGE_COOKIE}=${page}; ${attributes}\r\nCache-Control: no-store\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`,
    );
  }

  #toApp(bytes: Uint8Array) {
    if (this.#handle) {
      this.#handle.write(bytes);
      return;
    }
    if (this.#earlyBytes + bytes.length > MAX_EARLY_BYTES) {
      this.#socket.end();
      return;
    }
    this.#early.push(bytes.slice());
    this.#earlyBytes += bytes.length;
  }

  #fromApp(bytes: Uint8Array) {
    if (this.#closed) return;
    if (this.#answered) {
      this.#send(bytes);
      return;
    }
    this.#response = concat(this.#response, bytes);
    const end = headEnd(this.#response);
    if (end < 0) {
      if (this.#response.length > MAX_HEAD_BYTES)
        this.#reply(502, "The page's answer was too large");
      return;
    }
    const head = parseHead(latin1.decode(this.#response.subarray(0, end)));
    const rest = this.#response.subarray(end);
    this.#response = new Uint8Array(0);
    if (!head || !head.start.startsWith("HTTP/1.") || !this.#claims) {
      this.#handle?.close();
      this.#reply(502, "The page did not answer with HTTP");
      return;
    }
    this.#send(text(serializeHead(responseForBrowser(head, this.#claims.port))));
    const status = head.start.split(" ")[1] ?? "";
    const interim = status.startsWith("1") && status !== "101";
    if (interim) {
      this.#fromApp(rest);
      return;
    }
    this.#answered = true;
    if (rest.length > 0) this.#send(rest);
  }

  #appClosed(reason: string) {
    this.#handle = undefined;
    if (!this.#answered) {
      this.#reply(502, `Nothing answered on port ${this.#claims?.port}: ${reason}`);
      return;
    }
    this.#finish();
  }

  #reply(status: number, message: string) {
    if (this.#answered) {
      this.#finish();
      return;
    }
    const reasons: Record<number, string> = {
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      431: "Request Header Fields Too Large",
      502: "Bad Gateway",
    };
    const body = `<!doctype html><meta charset="utf-8"><title>Browser</title><body style="font:14px system-ui;margin:3rem;color:#444"><p>${escapeHtml(message)}</p>`;
    this.#answer(
      `HTTP/1.1 ${status} ${reasons[status] ?? "Error"}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nCache-Control: no-store\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
    );
  }

  #answer(response: string) {
    this.#answered = true;
    this.#handle?.close();
    this.#handle = undefined;
    this.#send(text(response));
    this.#finish();
  }

  #send(bytes: Uint8Array) {
    if (this.#closed) return;
    if (this.#queued.length === 0) {
      const taken = this.#socket.write(bytes);
      if (taken >= bytes.length) return;
      bytes = bytes.subarray(taken);
    }
    this.#queued.push(bytes);
    this.#queuedBytes += bytes.length;
    if (this.#queuedBytes > MAX_QUEUED_BYTES) {
      this.#handle?.close();
      this.#socket.end();
    }
  }

  #finish() {
    if (this.#queued.length === 0) this.#socket.end();
    else this.#finishing = true;
  }
}

export function startBrowserProxy(options: BrowserProxyOptions) {
  const server = Bun.listen<Relay>({
    hostname: options.hostname,
    port: options.port,
    socket: {
      open(socket) {
        socket.data = new Relay(socket, options);
        socket.timeout(HEAD_TIMEOUT_SECONDS);
      },
      data(socket, bytes) {
        socket.data.receive(bytes);
      },
      drain(socket) {
        socket.data.drained();
      },
      close(socket) {
        socket.data.closed();
      },
      timeout(socket) {
        socket.end();
      },
      error() {},
    },
  });
  return { port: server.port, stop: () => server.stop(true) };
}
