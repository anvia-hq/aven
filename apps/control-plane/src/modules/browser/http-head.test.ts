import { describe, expect, test } from "bun:test";

import {
  cookiesOf,
  headEnd,
  headerOf,
  parseHead,
  requestForPort,
  requestLine,
  responseForBrowser,
  serializeHead,
} from "./http-head";

const parse = (text: string) => parseHead(text.replaceAll("\n", "\r\n"))!;

describe("finding and reading a head", () => {
  test("finds the end of the head, and not before it", () => {
    const bytes = new TextEncoder().encode("GET / HTTP/1.1\r\nHost: a\r\n\r\nbody");
    expect(headEnd(bytes)).toBe("GET / HTTP/1.1\r\nHost: a\r\n\r\n".length);
    expect(headEnd(new TextEncoder().encode("GET / HTTP/1.1\r\nHost: a\r\n"))).toBe(-1);
  });

  test("reads the request line and the headers, and writes them back", () => {
    const head = parse("GET /a?b=1 HTTP/1.1\nHost: x\nAccept: */*");
    expect(requestLine(head)).toEqual({ method: "GET", target: "/a?b=1", version: "HTTP/1.1" });
    expect(headerOf(head, "host")).toBe("x");
    expect(serializeHead(head)).toBe("GET /a?b=1 HTTP/1.1\r\nHost: x\r\nAccept: */*\r\n\r\n");
  });

  test("refuses a folded header and a request that is not HTTP/1", () => {
    expect(parseHead("GET / HTTP/1.1\r\nHost: a\r\n folded: b")).toBeNull();
    expect(requestLine(parse("GET / HTTP/2"))).toBeNull();
    expect(requestLine(parse("GET /"))).toBeNull();
  });
});

describe("a request going to the app", () => {
  test("is made for the app's own address, with Connection: close", () => {
    const { head, upgrade } = requestForPort(
      parse(
        "GET /x HTTP/1.1\nHost: aven.example:8444\nOrigin: https://aven.example:8444\nReferer: https://aven.example:8444/page?q=1\nConnection: keep-alive\nKeep-Alive: timeout=5\nAccept: text/html",
      ),
      3000,
    );
    expect(upgrade).toBe(false);
    expect(headerOf(head, "host")).toBe("localhost:3000");
    expect(headerOf(head, "origin")).toBe("https://localhost:3000");
    expect(headerOf(head, "referer")).toBe("https://localhost:3000/page?q=1");
    expect(headerOf(head, "connection")).toBe("close");
    expect(headerOf(head, "keep-alive")).toBeUndefined();
    expect(headerOf(head, "accept")).toBe("text/html");
  });

  test("carries only the app's own cookies, without Aven's session or the page's", () => {
    const { head } = requestForPort(
      parse(
        "GET / HTTP/1.1\nCookie: better-auth.session_token=secret; aven-browser=token; aven-app.theme=dark; aven-app.sid=a=b",
      ),
      3000,
    );
    expect(headerOf(head, "cookie")).toBe("theme=dark; sid=a=b");
    expect(serializeHead(head)).not.toContain("secret");
    expect(serializeHead(head)).not.toContain("aven-browser");
  });

  test("has no Cookie header when the app set none", () => {
    const { head } = requestForPort(
      parse("GET / HTTP/1.1\nCookie: better-auth.session_token=s"),
      80,
    );
    expect(headerOf(head, "cookie")).toBeUndefined();
  });

  test("keeps a WebSocket upgrade an upgrade", () => {
    const { head, upgrade } = requestForPort(
      parse(
        "GET /hmr HTTP/1.1\nHost: a\nConnection: Upgrade\nUpgrade: websocket\nSec-WebSocket-Key: k\nOrigin: https://a",
      ),
      5173,
    );
    expect(upgrade).toBe(true);
    expect(headerOf(head, "connection")).toBe("Upgrade");
    expect(headerOf(head, "upgrade")).toBe("websocket");
    expect(headerOf(head, "origin")).toBe("https://localhost:5173");
  });

  test("drops an Origin that is not an address", () => {
    const { head } = requestForPort(parse("GET / HTTP/1.1\nOrigin: null"), 3000);
    expect(headerOf(head, "origin")).toBeUndefined();
  });
});

describe("a response going to the browser", () => {
  test("stores the app's cookies under a prefix, and drops their Domain", () => {
    const head = responseForBrowser(
      parse(
        "HTTP/1.1 200 OK\nSet-Cookie: better-auth.session_token=evil; Path=/; Domain=example.com; HttpOnly\nSet-Cookie: theme=dark",
      ),
      3000,
    );
    const cookies = head.headers
      .filter(([name]) => name === "Set-Cookie")
      .map(([, value]) => value);
    expect(cookies).toEqual([
      "aven-app.better-auth.session_token=evil; Path=/; HttpOnly",
      "aven-app.theme=dark",
    ]);
  });

  test("turns a redirect to the app's own address into a path", () => {
    const redirect = (to: string) =>
      headerOf(responseForBrowser(parse(`HTTP/1.1 302 Found\nLocation: ${to}`), 3000), "location");
    expect(redirect("http://localhost:3000/login?next=/a#top")).toBe("/login?next=/a#top");
    expect(redirect("http://127.0.0.1:3000/x")).toBe("/x");
    expect(redirect("/relative")).toBe("/relative");
    expect(redirect("https://elsewhere.test/x")).toBe("https://elsewhere.test/x");
    expect(redirect("http://localhost:4000/x")).toBe("http://localhost:4000/x");
  });

  test("lets Aven frame it, and cannot pin the host to HTTPS or clear Aven's data", () => {
    const head = responseForBrowser(
      parse(
        "HTTP/1.1 200 OK\nX-Frame-Options: DENY\nStrict-Transport-Security: max-age=63072000\nClear-Site-Data: \"cookies\"\nContent-Security-Policy: default-src 'self'; frame-ancestors 'none'",
      ),
      3000,
    );
    expect(headerOf(head, "x-frame-options")).toBeUndefined();
    expect(headerOf(head, "strict-transport-security")).toBeUndefined();
    expect(headerOf(head, "clear-site-data")).toBeUndefined();
    expect(headerOf(head, "content-security-policy")).toBe("default-src 'self'");
  });

  test("drops a policy that only said who may frame it", () => {
    const head = responseForBrowser(
      parse("HTTP/1.1 200 OK\nContent-Security-Policy: frame-ancestors 'self'"),
      3000,
    );
    expect(headerOf(head, "content-security-policy")).toBeUndefined();
  });

  test("closes after a response, and keeps an upgrade open", () => {
    expect(
      headerOf(
        responseForBrowser(parse("HTTP/1.1 200 OK\nConnection: keep-alive"), 80),
        "connection",
      ),
    ).toBe("close");
    const switched = responseForBrowser(
      parse("HTTP/1.1 101 Switching Protocols\nUpgrade: websocket\nConnection: Upgrade"),
      80,
    );
    expect(headerOf(switched, "connection")).toBe("Upgrade");
    expect(headerOf(switched, "upgrade")).toBe("websocket");
  });
});

describe("cookies of a request", () => {
  test("are read by name", () => {
    expect(cookiesOf(parse("GET / HTTP/1.1\nCookie: a=1; b=2=3\nCookie: c=4")).get("b")).toBe(
      "2=3",
    );
  });
});
