import { afterEach, describe, expect, test } from "bun:test";

import { ENTER_PATH, startBrowserProxy } from "./proxy";
import { signBrowserToken } from "./token";
import type { BrowserClaims } from "./types";
import type { ViewerHandle, ViewerSink } from "../runtimes/types";

const secret = new TextEncoder().encode("the server's secret");
const claims: BrowserClaims = { organizationId: "org", threadId: "thread", port: 3000 };
const decoder = new TextDecoder();
const encoder = new TextEncoder();

type App = {
  received: string[];
  opened: BrowserClaims[];
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
  const proxy = startBrowserProxy({
    hostname: "127.0.0.1",
    port: 0,
    secret,
    secure: false,
    open: async (given, sink) => {
      if (options.refuse) throw new Error(options.refuse);
      app.opened.push(given);
      app.sink = sink;
      const handle: ViewerHandle = {
        write: (bytes) => {
          const text = decoder.decode(bytes);
          app.received.push(text);
          behave(app, text, sink);
        },
        close: () => {
          app.closed = true;
        },
      };
      return handle;
    },
  });
  stops.push(proxy.stop);
  return { app, port: proxy.port };
}

const page = () => signBrowserToken(secret, "page", claims, 60_000);
const ticket = () => signBrowserToken(secret, "ticket", claims, 60_000);

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

const ok = (sink: ViewerSink, extra = "", body = "hello") =>
  sink.data(
    encoder.encode(
      `HTTP/1.1 200 OK\r\nContent-Length: ${body.length}\r\nConnection: keep-alive\r\n${extra}\r\n${body}`,
    ),
  );

describe("the Browser's own address", () => {
  test("refuses a request that has no page cookie", async () => {
    const { port, app } = setup(() => undefined);
    const answer = await raw(port, "GET / HTTP/1.1\r\nHost: x\r\n\r\n");
    expect(answer).toStartWith("HTTP/1.1 401");
    expect(app.opened).toEqual([]);
  });

  test("turns a ticket into a cookie that names the port, and goes to the root", async () => {
    const { port } = setup(() => undefined);
    const answer = await raw(
      port,
      `GET ${ENTER_PATH}?ticket=${ticket()} HTTP/1.1\r\nHost: x\r\n\r\n`,
    );
    expect(answer).toStartWith("HTTP/1.1 302");
    expect(answer).toContain("Location: /\r\n");
    expect(answer).toMatch(
      /Set-Cookie: aven-browser=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=3600\r\n/,
    );
    expect(answer).not.toContain("Secure");
  });

  test("refuses a ticket that is made up, or is a page cookie", async () => {
    const { port } = setup(() => undefined);
    for (const given of ["nonsense", page()]) {
      const answer = await raw(
        port,
        `GET ${ENTER_PATH}?ticket=${given} HTTP/1.1\r\nHost: x\r\n\r\n`,
      );
      expect(answer).toStartWith("HTTP/1.1 403");
    }
  });

  test("refuses a cookie that is a ticket", async () => {
    const { port } = setup(() => undefined);
    const answer = await raw(
      port,
      `GET / HTTP/1.1\r\nHost: x\r\nCookie: aven-browser=${ticket()}\r\n\r\n`,
    );
    expect(answer).toStartWith("HTTP/1.1 401");
  });
});

describe("a page of the sandbox's app", () => {
  test("is asked for as the app's own address, without Aven's cookies", async () => {
    const { port, app } = setup((_app, _text, sink) => ok(sink));
    await raw(
      port,
      `GET /a HTTP/1.1\r\nHost: aven.example:8444\r\nCookie: aven-browser=${page()}; better-auth.session_token=secret; aven-app.theme=dark\r\n\r\n`,
    );
    expect(app.opened).toEqual([claims]);
    const sent = app.received.join("");
    expect(sent).toStartWith("GET /a HTTP/1.1\r\n");
    expect(sent).toContain("Host: localhost:3000\r\n");
    expect(sent).toContain("Cookie: theme=dark\r\n");
    expect(sent).toContain("Connection: close\r\n");
    expect(sent).not.toContain("secret");
    expect(sent).not.toContain("aven-browser");
  });

  test("answers to the browser with the app's cookies kept apart, and closes", async () => {
    const { port } = setup((_app, _text, sink) =>
      ok(sink, "Set-Cookie: sid=1; Domain=x.test\r\nX-Frame-Options: DENY\r\n"),
    );
    const answer = await raw(
      port,
      `GET / HTTP/1.1\r\nHost: x\r\nCookie: aven-browser=${page()}\r\n\r\n`,
    );
    expect(answer).toStartWith("HTTP/1.1 200 OK");
    expect(answer).toContain("Set-Cookie: aven-app.sid=1\r\n");
    expect(answer).not.toContain("X-Frame-Options");
    expect(answer).toContain("Connection: close\r\n");
    expect(answer).toEndWith("\r\n\r\nhello");
  });

  test("gets a body that follows the head, and one that arrives later", async () => {
    const { port, app } = setup(() => undefined);
    await raw(
      port,
      `POST /save HTTP/1.1\r\nHost: x\r\nContent-Length: 10\r\nCookie: aven-browser=${page()}\r\n\r\nabc`,
      ["defghij"],
    );
    expect(app.received.join("")).toEndWith("\r\n\r\nabcdefghij");
  });

  test("says so when nothing answers, with what the runner said", async () => {
    const { port } = setup(() => undefined, { refuse: "The sandbox is not running" });
    const answer = await raw(
      port,
      `GET / HTTP/1.1\r\nHost: x\r\nCookie: aven-browser=${page()}\r\n\r\n`,
    );
    expect(answer).toStartWith("HTTP/1.1 502");
    expect(answer).toContain("The sandbox is not running");
  });

  test("says so when the port closes before it answers, and does not echo markup", async () => {
    const { port } = setup((_app, _text, sink) => sink.closed("<b>connection refused</b>"));
    const answer = await raw(
      port,
      `GET / HTTP/1.1\r\nHost: x\r\nCookie: aven-browser=${page()}\r\n\r\n`,
    );
    expect(answer).toStartWith("HTTP/1.1 502");
    expect(answer).toContain("Nothing answered on port 3000");
    expect(answer).not.toContain("<b>");
  });

  test("is refused when it does not answer with HTTP", async () => {
    const { port, app } = setup((_app, _text, sink) =>
      sink.data(encoder.encode("SSH-2.0-OpenSSH\r\n\r\n")),
    );
    const answer = await raw(
      port,
      `GET / HTTP/1.1\r\nHost: x\r\nCookie: aven-browser=${page()}\r\n\r\n`,
    );
    expect(answer).toStartWith("HTTP/1.1 502");
    expect(app.closed).toBe(true);
  });

  test("carries a WebSocket upgrade both ways", async () => {
    const { port } = setup((_app, text, sink) => {
      if (text.startsWith("GET /hmr")) {
        sink.data(
          encoder.encode(
            "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n",
          ),
        );
      } else sink.data(encoder.encode(`echo:${text}`));
    });
    const answer = await raw(
      port,
      `GET /hmr HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nCookie: aven-browser=${page()}\r\n\r\n`,
      ["frame-1"],
    );
    expect(answer).toStartWith("HTTP/1.1 101");
    expect(answer).toContain("Connection: Upgrade\r\n");
    expect(answer).toContain("echo:frame-1");
  });

  test("closes the app's connection when the browser goes away", async () => {
    const { port, app } = setup(() => undefined);
    await raw(port, `GET / HTTP/1.1\r\nHost: x\r\nCookie: aven-browser=${page()}\r\n\r\n`);
    await Bun.sleep(50);
    expect(app.closed).toBe(true);
  });

  test("refuses a head that never ends", async () => {
    const { port, app } = setup(() => undefined);
    const answer = await raw(port, `GET / HTTP/1.1\r\nX: ${"a".repeat(70_000)}`);
    expect(answer).toStartWith("HTTP/1.1 431");
    expect(app.opened).toEqual([]);
  });

  test("refuses a request that is not for a path", async () => {
    const { port } = setup(() => undefined);
    const answer = await raw(port, "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com\r\n\r\n");
    expect(answer).toStartWith("HTTP/1.1 400");
  });
});
