import { afterEach, describe, expect, test } from "bun:test";

import { PREVIEW_ENTER_PATH } from "@aven/protocol/preview";

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
const ticket = (claims = claim()) => signPreviewToken(secret, "ticket", claims, 60_000);
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
  options: { refuse?: string } = {},
) {
  const app: App = { received: [], opened: [], closed: false };
  const proxy = startPreviewProxy({
    hostname: "127.0.0.1",
    port: 0,
    domain,
    secret,
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
});
