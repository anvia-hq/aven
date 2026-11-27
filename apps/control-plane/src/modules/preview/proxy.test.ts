import { afterEach, describe, expect, test } from "bun:test";

import { PREVIEW_BRIDGE_PATH, PREVIEW_ENTER_PATH } from "@aven/protocol/preview";

import { PREVIEW_BRIDGE_TAG } from "./bridge";
import { EMBED_COOKIE, PAGE_COOKIE } from "./http-head";
import { startPreviewProxy } from "./proxy";
import { signPreviewToken } from "./token";
import type { PreviewClaims } from "./types";
import type { ViewerHandle, ViewerSink } from "../runtimes/types";

const domain = "aven.run";
const id = "00000000-0000-4000-8000-000000000001";
const secret = new TextEncoder().encode("the server's secret");
const decoder = new TextDecoder();
const encoder = new TextEncoder();

const claim = (port = 3000): PreviewClaims => ({ runtimeId: id, port });
const ticket = (claims = claim(), ttlMs = 60_000) =>
  signPreviewToken(secret, "ticket", claims, ttlMs);
const page = (claims = claim()) => signPreviewToken(secret, "page", claims, 3_600_000);
const embedPage = (claims = claim()) => signPreviewToken(secret, "embed", claims, 3_600_000);
const host = (port = 3000, runtime = id) => `${port}-${runtime}.${domain}`;

type App = {
  received: string[];
  opened: PreviewClaims[];
  sink?: ViewerSink;
  closed: boolean;
};

let stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
});

function setup(
  behave: (app: App, text: string, sink: ViewerSink) => void,
  options: { refuse?: string; appOrigins?: readonly string[] } = {},
) {
  const app: App = { received: [], opened: [], closed: false };
  const proxy = startPreviewProxy({
    hostname: "127.0.0.1",
    port: 0,
    domain,
    secret,
    appOrigins: options.appOrigins,
    open: async (given, sink) => {
      if (options.refuse) throw new Error(options.refuse);

      app.opened.push(given);
      app.sink = sink;
      return {
        write: (bytes: Uint8Array) => {
          const text = decoder.decode(bytes);
          app.received.push(text);
          behave(app, text, sink);
        },
        close: () => {
          app.closed = true;
        },
      } satisfies ViewerHandle;
    },
  });
  stops.push(proxy.stop);
  return { app, port: proxy.port };
}

async function raw(port: number, request: string, more: string[] = []) {
  const chunks: Uint8Array[] = [];
  const done = Promise.withResolvers<void>();
  const socket = await Bun.connect({
    hostname: "127.0.0.1",
    port,
    socket: {
      data: (_socket, bytes) => void chunks.push(bytes.slice()),
      close: () => done.resolve(),
      error: () => done.resolve(),
    },
  });
  socket.write(request);

  for (const next of more) {
    await Bun.sleep(30);
    socket.write(next);
  }

  await Promise.race([done.promise, Bun.sleep(1500)]);
  socket.end();
  return decoder.decode(Buffer.concat(chunks));
}

const ok = (sink: ViewerSink, extra = "", body = "hello") => {
  sink.data(
    encoder.encode(
      `HTTP/1.1 200 OK\r\nContent-Length: ${body.length}\r\nConnection: keep-alive\r\n${extra}\r\n${body}`,
    ),
  );
  sink.closed("The port finished answering");
};

describe("a preview's host", () => {
  test("is refused when it is not one", async () => {
    const { port, app } = setup(() => undefined);

    for (const hostname of [domain, `x.${host()}`, `${host()}.example.com`, "localhost"]) {
      const answer = await raw(port, `GET / HTTP/1.1\r\nHost: ${hostname}\r\n\r\n`);
      expect(answer).toStartWith("HTTP/1.1 404");
    }

    expect(app.opened).toEqual([]);
  });
});

describe("the ticket", () => {
  test("becomes a private first-party cookie, and the address loses the ticket", async () => {
    const { port } = setup(() => undefined);
    const answer = await raw(
      port,
      `GET ${PREVIEW_ENTER_PATH}?ticket=${ticket()} HTTP/1.1\r\nHost: ${host()}\r\n\r\n`,
    );

    expect(answer).toStartWith("HTTP/1.1 200");
    expect(answer).toContain('location.replace("/")');
    expect(answer).not.toContain("Location:");
    expect(answer).toMatch(
      new RegExp(
        `Set-Cookie: ${PAGE_COOKIE}=[^;]+; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=3600\\r\\n`,
      ),
    );
    expect(answer).toContain("Referrer-Policy: no-referrer\r\n");
  });

  test("becomes a partitioned cookie for the embedded panel", async () => {
    const { port } = setup(() => undefined);
    const answer = await raw(
      port,
      `GET ${PREVIEW_ENTER_PATH}?ticket=${ticket()}&embed=1 HTTP/1.1\r\nHost: ${host()}\r\n\r\n`,
    );

    expect(answer).toStartWith("HTTP/1.1 200");
    expect(answer).toMatch(
      new RegExp(
        `Set-Cookie: ${EMBED_COOKIE}=[^;]+; Path=/; HttpOnly; SameSite=None; Secure; Partitioned; Max-Age=3600\\r\\n`,
      ),
    );
  });

  test("is spent once", async () => {
    const { port } = setup(() => undefined);
    const given = ticket();
    const path = `${PREVIEW_ENTER_PATH}?ticket=${given}`;
    expect(await raw(port, `GET ${path} HTTP/1.1\r\nHost: ${host()}\r\n\r\n`)).toStartWith(
      "HTTP/1.1 200",
    );
    expect(await raw(port, `GET ${path} HTTP/1.1\r\nHost: ${host()}\r\n\r\n`)).toStartWith(
      "HTTP/1.1 403",
    );
  });

  test("is refused for another host, a page cookie, or a made-up ticket", async () => {
    const { port } = setup(() => undefined);

    for (const given of [ticket(claim(3001)), page(), "nonsense"]) {
      const answer = await raw(
        port,
        `GET ${PREVIEW_ENTER_PATH}?ticket=${given} HTTP/1.1\r\nHost: ${host()}\r\n\r\n`,
      );
      expect(answer).toStartWith("HTTP/1.1 403");
    }
  });
});

describe("a page", () => {
  test("is refused without the cookie, or with one for another host", async () => {
    const { port, app } = setup(() => undefined);

    expect(await raw(port, `GET / HTTP/1.1\r\nHost: ${host()}\r\n\r\n`)).toStartWith(
      "HTTP/1.1 401",
    );
    expect(
      await raw(
        port,
        `GET / HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${PAGE_COOKIE}=${page(claim(3001))}\r\n\r\n`,
      ),
    ).toStartWith("HTTP/1.1 401");
    expect(
      await raw(
        port,
        `GET / HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${EMBED_COOKIE}=${page()}\r\n\r\n`,
      ),
    ).toStartWith("HTTP/1.1 401");
    expect(app.opened).toEqual([]);
  });

  test("is refused when another preview host asks for it", async () => {
    const { port, app } = setup((_app, _text, sink) => ok(sink));
    const answer = await raw(
      port,
      `GET / HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${PAGE_COOKIE}=${page()}\r\nSec-Fetch-Site: same-site\r\n\r\n`,
    );

    expect(answer).toStartWith("HTTP/1.1 403");
    expect(app.opened).toEqual([]);
  });

  test("is carried when its own host, the address bar or the panel asks for it", async () => {
    for (const site of ["same-origin", "none", "cross-site"]) {
      const { port, app } = setup((_app, _text, sink) => ok(sink));
      const answer = await raw(
        port,
        `GET / HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${PAGE_COOKIE}=${page()}\r\nSec-Fetch-Site: ${site}\r\n\r\n`,
      );

      expect(answer).toStartWith("HTTP/1.1 200");
      expect(app.opened).toEqual([claim()]);
    }
  });

  test("is asked for as localhost on its port, with the panel's own cookie kept apart", async () => {
    const { port, app } = setup((_app, _text, sink) => ok(sink));
    await raw(
      port,
      `GET /a HTTP/1.1\r\nHost: ${host()}:443\r\nCookie: ${PAGE_COOKIE}=${page()}; theme=dark\r\nOrigin: https://${host()}\r\nReferer: https://${host()}/b?c=1\r\n\r\n`,
    );

    expect(app.opened).toEqual([claim()]);
    const sent = app.received.join("");
    expect(sent).toStartWith("GET /a HTTP/1.1\r\n");
    expect(sent).toContain("Host: localhost:3000\r\n");
    expect(sent).toContain("Origin: http://localhost:3000\r\n");
    expect(sent).toContain("Referer: http://localhost:3000/b?c=1\r\n");
    expect(sent).toContain("Cookie: theme=dark\r\n");
    expect(sent).toContain("Connection: close\r\n");
    expect(sent).not.toContain(PAGE_COOKIE);
  });

  test("is answered with no-referrer and without the app's own address", async () => {
    const { port } = setup((_app, _text, sink) => {
      sink.data(
        encoder.encode(
          "HTTP/1.1 302 Found\r\nLocation: http://localhost:3000/login\r\nX-Frame-Options: DENY\r\nContent-Length: 0\r\n\r\n",
        ),
      );
      sink.closed("The port finished answering");
    });
    const answer = await raw(
      port,
      `GET / HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${PAGE_COOKIE}=${page()}\r\n\r\n`,
    );

    expect(answer).toStartWith("HTTP/1.1 302");
    expect(answer).toContain("Location: /login\r\n");
    expect(answer).not.toContain("X-Frame-Options");
    expect(answer).toContain("Referrer-Policy: no-referrer\r\n");
    expect(answer).toContain("Connection: close\r\n");
  });

  test("gets what a browser sends after the head", async () => {
    const { port, app } = setup(() => undefined);
    await raw(
      port,
      `POST /save HTTP/1.1\r\nHost: ${host()}\r\nContent-Length: 10\r\nCookie: ${PAGE_COOKIE}=${page()}\r\n\r\nabc`,
      ["defghij"],
    );
    expect(app.received.join("")).toEndWith("\r\n\r\nabcdefghij");
  });

  test("is refused when its port is one the denylist names", async () => {
    const { port, app } = setup(() => undefined);
    const answer = await raw(
      port,
      `GET / HTTP/1.1\r\nHost: ${host(22)}\r\nCookie: ${PAGE_COOKIE}=${page(claim(22))}\r\n\r\n`,
    );

    expect(answer).toStartWith("HTTP/1.1 403");
    expect(answer).toContain("not a preview");
    expect(app.opened).toEqual([]);
  });

  test("says so when nothing answers, without echoing markup", async () => {
    const { port } = setup(() => undefined, { refuse: "<b>connection refused</b>" });
    const answer = await raw(
      port,
      `GET / HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${PAGE_COOKIE}=${page()}\r\n\r\n`,
    );

    expect(answer).toStartWith("HTTP/1.1 502");
    expect(answer).toContain("Nothing answered on port 3000");
    expect(answer).not.toContain("<b>");
    expect(answer).toContain("&#60;b&#62;");
  });

  test("stops when the port closes before it answers", async () => {
    const { port } = setup((_app, _text, sink) => sink.closed("connection refused"));
    const answer = await raw(
      port,
      `GET / HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${EMBED_COOKIE}=${embedPage()}\r\n\r\n`,
    );
    expect(answer).toStartWith("HTTP/1.1 502");
  });

  test("upgrades app session cookies for embedded previews while leaving top-level tabs intact", async () => {
    const { port } = setup((_app, _text, sink) => {
      sink.data(
        encoder.encode(
          "HTTP/1.1 200 OK\r\nSet-Cookie: session=tok; Path=/; HttpOnly; SameSite=Lax\r\nContent-Length: 2\r\n\r\nok",
        ),
      );
      sink.closed("done");
    });

    const embedded = await raw(
      port,
      `GET /login HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${EMBED_COOKIE}=${embedPage()}\r\n\r\n`,
    );
    expect(embedded).toContain(
      "Set-Cookie: session=tok; Path=/; HttpOnly; SameSite=None; Secure; Partitioned\r\n",
    );

    const topLevel = await raw(
      port,
      `GET /login HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${PAGE_COOKIE}=${page()}\r\n\r\n`,
    );
    expect(topLevel).toContain("Set-Cookie: session=tok; Path=/; HttpOnly; SameSite=Lax\r\n");
    expect(topLevel).not.toContain("Partitioned");
  });

  test("navigates to a safe path on enter and refuses protocol-relative or script-breaking paths", async () => {
    const { port } = setup(() => undefined);
    const deep = await raw(
      port,
      `GET ${PREVIEW_ENTER_PATH}?ticket=${ticket(claim(), 60_001)}&embed=1&path=${encodeURIComponent("/reports?id=42#top")} HTTP/1.1\r\nHost: ${host()}\r\n\r\n`,
    );
    expect(deep).toStartWith("HTTP/1.1 200");
    expect(deep).toContain('location.replace("/reports?id=42#top")');

    const unsafe = await raw(
      port,
      `GET ${PREVIEW_ENTER_PATH}?ticket=${ticket(claim(), 60_002)}&path=${encodeURIComponent("//evil.test/steal")} HTTP/1.1\r\nHost: ${host()}\r\n\r\n`,
    );
    expect(unsafe).toStartWith("HTTP/1.1 200");
    expect(unsafe).toContain('location.replace("/")');

    const breakout = await raw(
      port,
      `GET ${PREVIEW_ENTER_PATH}?ticket=${ticket(claim(), 60_003)}&path=${encodeURIComponent("/x</script><script>alert(1)")} HTTP/1.1\r\nHost: ${host()}\r\n\r\n`,
    );
    expect(breakout).toStartWith("HTTP/1.1 200");
    expect(breakout).not.toContain("</script><script>alert(1)");
    expect(breakout).toContain('location.replace("/x%3C/script%3E%3Cscript%3Ealert(1)")');
  });

  test("serves the preview bridge script only to authenticated preview sessions", async () => {
    const { port, app } = setup(() => undefined, { appOrigins: ["https://aven.sh"] });

    expect(
      await raw(port, `GET ${PREVIEW_BRIDGE_PATH} HTTP/1.1\r\nHost: ${host()}\r\n\r\n`),
    ).toStartWith("HTTP/1.1 401");

    expect(
      await raw(
        port,
        `GET ${PREVIEW_BRIDGE_PATH} HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${EMBED_COOKIE}=${embedPage()}\r\nSec-Fetch-Site: same-site\r\n\r\n`,
      ),
    ).toStartWith("HTTP/1.1 403");

    const script = await raw(
      port,
      `GET ${PREVIEW_BRIDGE_PATH} HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${EMBED_COOKIE}=${embedPage()}\r\n\r\n`,
    );
    expect(script).toStartWith("HTTP/1.1 200");
    expect(script).toContain("Content-Type: application/javascript; charset=utf-8\r\n");
    expect(script).toContain("https://aven.sh");
    expect(script).toContain("aven:preview:location");
    expect(app.opened).toEqual([]);
  });

  test("injects the bridge into embedded HTML documents (Content-Length, chunked, and close-delimited)", async () => {
    const html = "<!doctype html><html><body><h1>Hi</h1></body></html>";
    const { port, app } = setup((_app, req, sink) => {
      if (req.startsWith("GET /cl ")) {
        sink.data(
          encoder.encode(
            `HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${html.length}\r\n\r\n${html}`,
          ),
        );
        sink.closed("done");
        return;
      }

      if (req.startsWith("GET /chunked ")) {
        const part1 = "<!doctype html><html><body>";
        const part2 = "<h1>Stream</h1></body></html>";
        sink.data(
          encoder.encode(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n",
          ),
        );
        sink.data(encoder.encode(`${part1.length.toString(16)}\r\n${part1.slice(0, 10)}`));
        sink.data(encoder.encode(`${part1.slice(10)}\r\n`));
        sink.data(encoder.encode(`${part2.length.toString(16)}\r\n${part2}\r\n0\r\n\r\n`));
        sink.closed("done");
        return;
      }

      sink.data(encoder.encode(`HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n${html}`));
      sink.closed("done");
    });

    const cl = await raw(
      port,
      `GET /cl HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${EMBED_COOKIE}=${embedPage()}\r\nAccept: text/html\r\nAccept-Encoding: gzip, br\r\nSec-Fetch-Dest: iframe\r\n\r\n`,
    );
    expect(app.received[0]).not.toContain("Accept-Encoding:");
    expect(cl).toContain(`Content-Length: ${html.length + PREVIEW_BRIDGE_TAG.length}\r\n`);
    expect(cl).toEndWith(`${html}${PREVIEW_BRIDGE_TAG}`);

    const chunked = await raw(
      port,
      `GET /chunked HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${EMBED_COOKIE}=${embedPage()}\r\nSec-Fetch-Dest: iframe\r\n\r\n`,
    );
    expect(chunked).toContain("Transfer-Encoding: chunked\r\n");
    expect(chunked).toContain(
      `${PREVIEW_BRIDGE_TAG.length.toString(16)}\r\n${PREVIEW_BRIDGE_TAG}\r\n0\r\n\r\n`,
    );

    const closeDelimited = await raw(
      port,
      `GET /close HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${EMBED_COOKIE}=${embedPage()}\r\nSec-Fetch-Dest: iframe\r\n\r\n`,
    );
    expect(closeDelimited).toEndWith(`${html}${PREVIEW_BRIDGE_TAG}`);
  });

  test("leaves top-level pages, API calls, non-HTML assets, and compressed HTML untouched", async () => {
    const html = "<html><body>ok</body></html>";
    const { port, app } = setup((_app, req, sink) => {
      if (req.startsWith("GET /api ")) {
        sink.data(
          encoder.encode(
            'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{"ok":true}',
          ),
        );
        sink.closed("done");
        return;
      }

      if (req.startsWith("GET /gzip ")) {
        sink.data(
          encoder.encode(
            `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Encoding: gzip\r\nContent-Length: ${html.length}\r\n\r\n${html}`,
          ),
        );
        sink.closed("done");
        return;
      }

      sink.data(
        encoder.encode(
          `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${html.length}\r\n\r\n${html}`,
        ),
      );
      sink.closed("done");
    });

    const topLevel = await raw(
      port,
      `GET / HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${PAGE_COOKIE}=${page()}\r\nAccept: text/html\r\nAccept-Encoding: gzip\r\nSec-Fetch-Dest: document\r\n\r\n`,
    );
    expect(app.received[0]).toContain("Accept-Encoding: gzip\r\n");
    expect(topLevel).not.toContain(PREVIEW_BRIDGE_TAG);

    const api = await raw(
      port,
      `GET /api HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${EMBED_COOKIE}=${embedPage()}\r\nAccept-Encoding: gzip\r\nSec-Fetch-Dest: empty\r\n\r\n`,
    );
    expect(app.received[1]).toContain("Accept-Encoding: gzip\r\n");
    expect(api).not.toContain(PREVIEW_BRIDGE_TAG);

    const gzipped = await raw(
      port,
      `GET /gzip HTTP/1.1\r\nHost: ${host()}\r\nCookie: ${EMBED_COOKIE}=${embedPage()}\r\nSec-Fetch-Dest: iframe\r\n\r\n`,
    );
    expect(gzipped).not.toContain(PREVIEW_BRIDGE_TAG);
  });
});
