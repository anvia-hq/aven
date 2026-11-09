import { afterEach, describe, expect, test } from "bun:test";

import { startIdentityRelay } from "./identity-relay";

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

const target = () => {
  const asked: { path: string; authorization: string | null; body: string }[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      asked.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get("authorization"),
        body: await request.text(),
      });
      return Response.json({ token: "a.b.c" }, { status: 201 });
    },
  });
  stops.push(() => void server.stop(true));
  return { asked, url: `http://localhost:${server.port}` };
};

const relay = (controlPlane: string) => {
  const started = startIdentityRelay(controlPlane);
  stops.push(started.stop);
  return `http://localhost:${started.port}`;
};

describe("the identity relay", () => {
  test("passes a token request to the control plane with its credential, and the answer back", async () => {
    const control = target();
    const response = await fetch(`${relay(control.url)}/workload-identity/token`, {
      method: "POST",
      headers: { authorization: "Bearer avid_x", "content-type": "application/json" },
      body: JSON.stringify({ audience: "svc" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ token: "a.b.c" });
    expect(control.asked).toEqual([
      {
        path: "/workload-identity/token",
        authorization: "Bearer avid_x",
        body: JSON.stringify({ audience: "svc" }),
      },
    ]);
  });

  test("passes nothing else on: another path or a GET is a 404 and never reaches the control plane", async () => {
    const control = target();
    const address = relay(control.url);

    expect((await fetch(`${address}/threads`, { method: "POST", body: "{}" })).status).toBe(404);
    expect((await fetch(`${address}/workload-identity/token`)).status).toBe(404);
    expect(control.asked).toEqual([]);
  });

  test("says 502 when the control plane cannot be reached", async () => {
    const address = relay("http://localhost:1");
    const response = await fetch(`${address}/workload-identity/token`, {
      method: "POST",
      body: "{}",
    });

    expect(response.status).toBe(502);
  });
});
