import type { Socket } from "bun";

import {
  normalizePreviewPath,
  PREVIEW_BRIDGE_PATH,
  PREVIEW_ENTER_PATH,
  previewPortRefusal,
} from "@aven/protocol/preview";

import {
  ChunkedTailInjector,
  isEmbedDocumentRequest,
  PREVIEW_BRIDGE_TAG_BYTES,
  previewBridgeScript,
  shouldInjectBridge,
} from "./bridge";

import {
  EMBED_COOKIE,
  MAX_HEAD_BYTES,
  PAGE_COOKIE,
  cookiesOf,
  headEnd,
  headerOf,
  parseHead,
  requestForPort,
  requestLine,
  responseForBrowser,
  serializeHead,
} from "./http-head";
import { previewHost } from "./host";
import { SpentTickets, sameClaims, signPreviewToken, verifyPreviewToken } from "./token";
import type { PreviewProxyOptions, PreviewClaims } from "./types";
import type { ViewerHandle } from "../runtimes/types";

export const PAGE_TTL_MS = 60 * 60 * 1000;

const HEAD_TIMEOUT_SECONDS = 30;
const MAX_EARLY_BYTES = 1024 * 1024;
const MAX_QUEUED_BYTES = 8 * 1024 * 1024;

const latin1 = new TextDecoder("latin1");
const text = (value: string) => Buffer.from(value, "latin1");

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export function enterPage(target = "/"): string {
  const normalized = normalizePreviewPath(target);
  const literal = JSON.stringify(normalized).replace(/</g, "\\u003c");
  return `<!doctype html><meta charset="utf-8"><title>Preview</title><script>location.replace(${literal})</script><noscript><meta http-equiv="refresh" content="0;url=${escapeHtml(normalized)}"></noscript>`;
}

export const ENTER_PAGE = enterPage("/");

const concat = (a: Uint8Array, b: Uint8Array) => {
  const joined = new Uint8Array(a.length + b.length);
  joined.set(a);
  joined.set(b, a.length);
  return joined;
};

class Relay {
  #socket: Socket<Relay>;
  #options: PreviewProxyOptions;
  #ledger: SpentTickets;
  #request: Uint8Array = new Uint8Array(0);
  #response: Uint8Array = new Uint8Array(0);
  #early: Uint8Array[] = [];
  #earlyBytes = 0;
  #queued: Uint8Array[] = [];
  #queuedBytes = 0;
  #handle: ViewerHandle | undefined;
  #claims: PreviewClaims | undefined;
  #embed = false;
  #embedDocument = false;
  #chunkedInjector: ChunkedTailInjector | undefined;
  #contentRemaining: number | undefined;
  #appendOnClose = false;
  #routed = false;
  #answered = false;
  #finishing = false;
  #closed = false;

  constructor(socket: Socket<Relay>, options: PreviewProxyOptions, ledger: SpentTickets) {
    this.#socket = socket;
    this.#options = options;
    this.#ledger = ledger;
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
      this.#reply(400, "This is not a request the preview can carry");
      return;
    }

    const claims = previewHost(headerOf(head, "host"), this.#options.domain);

    if (!claims) {
      this.#reply(404, "This address is not a preview of a runner");
      return;
    }

    this.#claims = claims;
    const url = new URL(line.target, "http://preview.invalid");

    if (url.pathname === PREVIEW_ENTER_PATH) {
      this.#enter(line.method, url.searchParams);
      return;
    }

    const refusal = previewPortRefusal(claims.port);

    if (refusal) {
      this.#reply(403, refusal);
      return;
    }

    const jar = cookiesOf(head);
    const page = jar.get(PAGE_COOKIE);
    const embed = jar.get(EMBED_COOKIE);
    const token = page ?? embed;
    const grant = token
      ? verifyPreviewToken(this.#options.secret, page ? "page" : "embed", token)
      : null;

    if (!grant || !sameClaims(grant.claims, claims)) {
      this.#reply(401, "Open the preview again from the thread: this preview's session is gone.");
      return;
    }

    this.#embed = !page;

    if (headerOf(head, "sec-fetch-site")?.toLowerCase() === "same-site") {
      this.#reply(403, "A page of another preview cannot reach this one");
      return;
    }

    if (url.pathname === PREVIEW_BRIDGE_PATH && line.method === "GET") {
      const script = previewBridgeScript(this.#options.appOrigins);
      this.#answer(
        `HTTP/1.1 200 OK\r\nContent-Type: application/javascript; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Length: ${Buffer.byteLength(script)}\r\nConnection: close\r\n\r\n${script}`,
      );
      return;
    }

    this.#embedDocument = isEmbedDocumentRequest(head, this.#embed);
    const forwarded = requestForPort(head, claims.port, { stripEncoding: this.#embedDocument });
    const first = concat(text(serializeHead(forwarded.head)), rest);
    this.#options
      .open(claims, {
        data: (bytes) => this.#fromApp(bytes),
        closed: (reason) => this.#appClosed(reason),
      })
      .then(
        (handle) => {
          if (this.#closed || this.#answered) return handle.close();

          this.#handle = handle;
          handle.write(first);
          for (const early of this.#early) handle.write(early);
          this.#early = [];
        },
        (error: unknown) =>
          this.#reply(
            502,
            `Nothing answered on port ${claims.port}: ${error instanceof Error ? error.message : "The preview could not be opened"}`,
          ),
      );
  }

  #enter(method: string, params: URLSearchParams) {
    const claims = this.#claims;
    const ticket = params.get("ticket") ?? "";
    const grant =
      method === "GET" ? verifyPreviewToken(this.#options.secret, "ticket", ticket) : null;

    if (!claims || !grant || !sameClaims(grant.claims, claims)) {
      this.#reply(403, "This link has expired. Open the preview again from the thread.");
      return;
    }

    if (!this.#ledger.spend(ticket, grant.expiresAt)) {
      this.#reply(403, "This link was used already. Open the preview again from the thread.");
      return;
    }

    const embed = params.get("embed") === "1";
    const kind = embed ? "embed" : "page";
    const token = signPreviewToken(this.#options.secret, kind, claims, PAGE_TTL_MS);
    const attributes = embed
      ? `Path=/; HttpOnly; SameSite=None; Secure; Partitioned; Max-Age=${PAGE_TTL_MS / 1000}`
      : `Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${PAGE_TTL_MS / 1000}`;
    const cookie = embed ? EMBED_COOKIE : PAGE_COOKIE;
    const body = enterPage(params.get("path") ?? undefined);
    this.#answer(
      `HTTP/1.1 200 OK\r\nSet-Cookie: ${cookie}=${token}; ${attributes}\r\nReferrer-Policy: no-referrer\r\nCache-Control: no-store\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
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

  #sendBody(bytes: Uint8Array) {
    if (this.#chunkedInjector) {
      this.#chunkedInjector.push(bytes);
      return;
    }

    if (bytes.length > 0) this.#send(bytes);

    if (this.#contentRemaining !== undefined) {
      this.#contentRemaining -= bytes.length;

      if (this.#contentRemaining <= 0) {
        this.#contentRemaining = undefined;
        this.#send(PREVIEW_BRIDGE_TAG_BYTES);
      }
    }
  }

  #fromApp(bytes: Uint8Array) {
    if (this.#closed) return;

    if (this.#answered) {
      this.#sendBody(bytes);
      return;
    }

    this.#response = concat(this.#response, bytes);
    const end = headEnd(this.#response);

    if (end < 0) {
      if (this.#response.length > MAX_HEAD_BYTES)
        this.#reply(502, "The preview's answer was too large");

      return;
    }

    const head = parseHead(latin1.decode(this.#response.subarray(0, end)));
    const rest = this.#response.subarray(end);
    this.#response = new Uint8Array(0);

    if (!head || !head.start.startsWith("HTTP/1.") || !this.#claims) {
      this.#handle?.close();
      this.#reply(502, "The port did not answer with HTTP");
      return;
    }

    const status = head.start.split(" ")[1] ?? "";
    const interim = status.startsWith("1") && status !== "101";

    if (interim) {
      this.#send(
        text(serializeHead(responseForBrowser(head, this.#claims.port, { embed: this.#embed }))),
      );
      this.#fromApp(rest);
      return;
    }

    let appendLength: number | undefined;

    if (shouldInjectBridge(head, this.#embedDocument)) {
      const transferEncoding = headerOf(head, "transfer-encoding")?.toLowerCase() ?? "";
      const contentLength = headerOf(head, "content-length")?.trim();

      if (transferEncoding.includes("chunked")) {
        this.#chunkedInjector = new ChunkedTailInjector(PREVIEW_BRIDGE_TAG_BYTES, (chunk) =>
          this.#send(chunk),
        );
      } else if (contentLength !== undefined && /^\d+$/.test(contentLength)) {
        appendLength = PREVIEW_BRIDGE_TAG_BYTES.length;
        this.#contentRemaining = Number(contentLength);
      } else {
        this.#appendOnClose = true;
      }
    }

    this.#send(
      text(
        serializeHead(
          responseForBrowser(head, this.#claims.port, { embed: this.#embed, appendLength }),
        ),
      ),
    );
    this.#answered = true;

    if (rest.length > 0 || this.#contentRemaining === 0) this.#sendBody(rest);
  }

  #appClosed(reason: string) {
    this.#handle = undefined;

    if (!this.#answered) {
      this.#reply(502, `Nothing answered on port ${this.#claims?.port}: ${reason}`);
      return;
    }

    if (this.#chunkedInjector) this.#chunkedInjector.flush();

    if (this.#appendOnClose) {
      this.#appendOnClose = false;
      this.#send(PREVIEW_BRIDGE_TAG_BYTES);
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
      404: "Not Found",
      431: "Request Header Fields Too Large",
      502: "Bad Gateway",
    };
    const body = `<!doctype html><meta charset="utf-8"><title>Preview</title><body style="font:14px system-ui;margin:3rem;color:#444"><p>${escapeHtml(message)}</p>`;
    this.#answer(
      `HTTP/1.1 ${status} ${reasons[status] ?? "Error"}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nReferrer-Policy: no-referrer\r\nCache-Control: no-store\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
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

export function startPreviewProxy(options: PreviewProxyOptions, ledger = new SpentTickets()) {
  const server = Bun.listen<Relay>({
    hostname: options.hostname,
    port: options.port,
    socket: {
      open(socket) {
        socket.data = new Relay(socket, options, ledger);
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
