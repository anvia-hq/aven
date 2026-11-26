import { afterEach, describe, expect, test } from "bun:test";

import { parseProxyRoutes, startPreviewProxyServer } from "./preview-proxy";

const stops: Array<() => void> = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

describe("aven preview proxy", () => {
  test("parses comma-separated routes longest-prefix-first and rejects bad ports", () => {
    expect(parseProxyRoutes("/api=8010, /api/v2=8020, auth=8030")).toEqual([
      { prefix: "/api/v2", port: 8020 },
      { prefix: "/auth", port: 8030 },
      { prefix: "/api", port: 8010 },
    ]);
    expect(() => parseProxyRoutes("/api=99999")).toThrow("--route");
    expect(() => parseProxyRoutes("missing-equals")).toThrow("Invalid --route");
  });

  test("routes HTML, Vite assets, IPv6-only web, API fetch calls, cookies, and explicit prefixes", async () => {
    const web = Bun.serve({
      hostname: "::1",
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        return new Response(`web:${url.pathname}:${req.headers.get("host")}`);
      },
    });
    stops.push(() => void web.stop(true));

    const api = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/api/redirect") {
          return new Response(null, {
            status: 302,
            headers: { location: `http://localhost:${url.port}/login?next=/` },
          });
        }

        const headers = new Headers({ "content-type": "application/json" });
        headers.append("set-cookie", "sid=abc; Path=/; HttpOnly");
        headers.append("set-cookie", "csrf=xyz; Path=/");
        return new Response(
          JSON.stringify({
            path: url.pathname,
            host: req.headers.get("host"),
            origin: req.headers.get("origin"),
          }),
          { headers },
        );
      },
    });
    stops.push(() => void api.stop(true));

    const proxy = startPreviewProxyServer({
      port: 0,
      webPort: web.port!,
      apiPort: api.port!,
      routes: [{ prefix: "/api", port: api.port! }],
    });
    stops.push(() => proxy.stop());

    const base = `http://127.0.0.1:${proxy.port}`;

    const page = await fetch(`${base}/threads/123`);
    expect(page.status).toBe(200);
    expect(await page.text()).toBe(`web:/threads/123:localhost:${web.port}`);

    const viteAsset = await fetch(`${base}/@vite/client`, {
      headers: { "sec-fetch-dest": "empty" },
    });
    expect(viteAsset.status).toBe(200);
    expect(await viteAsset.text()).toBe(`web:/@vite/client:localhost:${web.port}`);

    const xhr = await fetch(`${base}/threads`, {
      headers: {
        "sec-fetch-dest": "empty",
        origin: "https://5180-example.aven.run",
      },
    });
    expect(xhr.status).toBe(200);
    expect(await xhr.json()).toEqual({
      path: "/threads",
      host: `localhost:${api.port}`,
      origin: `http://localhost:${web.port}`,
    });
    expect(xhr.headers.getSetCookie()).toEqual(["sid=abc; Path=/; HttpOnly", "csrf=xyz; Path=/"]);

    const prefixed = await fetch(`${base}/api/health`);
    expect(prefixed.status).toBe(200);
    expect(await prefixed.json()).toEqual({
      path: "/api/health",
      host: `localhost:${api.port}`,
      origin: null,
    });

    const redirected = await fetch(`${base}/api/redirect`, { redirect: "manual" });
    expect(redirected.status).toBe(302);
    expect(redirected.headers.get("location")).toBe("/login?next=/");
  });

  test("proxies WebSocket upgrades to an IPv6-only upstream", async () => {
    const web = Bun.serve({
      hostname: "::1",
      port: 0,
      fetch(req, srv) {
        if (srv.upgrade(req)) return undefined;

        return new Response("ok");
      },
      websocket: {
        message(ws, message) {
          ws.send(`echo:${String(message)}`);
        },
      },
    });
    stops.push(() => void web.stop(true));

    const proxy = startPreviewProxyServer({
      port: 0,
      webPort: web.port!,
    });
    stops.push(() => proxy.stop());

    const reply = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${proxy.port}/hmr`);
      ws.addEventListener("open", () => ws.send("ping"));
      ws.addEventListener("message", (event) => {
        ws.close();
        resolve(String(event.data));
      });
      ws.addEventListener("error", () => reject(new Error("WebSocket failed")));
    });
    expect(reply).toBe("echo:ping");
  });
});
