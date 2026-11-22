import { describe, expect, test } from "bun:test";

import type { RunLens } from "@aven/protocol/types";
import { LENS_PROXY_PATH, LensProxy } from "./proxy";

const UPSTREAM: RunLens = {
  baseUrl: "https://lens.internal:8080",
  publicKey: "pk-real-123",
  secretKey: "sk-real-secret",
  captureMode: "full",
};

function basic(user: string, pass: string) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

describe("LensProxy", () => {
  test("issues a stable runner-scoped proxy token without leaking upstream credentials", () => {
    const proxy = new LensProxy(
      async () => UPSTREAM,
      () => true,
    );
    const first = proxy.forRunner("rt-1", UPSTREAM);
    const second = proxy.forRunner("rt-1", UPSTREAM);

    expect(first?.baseUrl).toBe(LENS_PROXY_PATH);
    expect(first?.publicKey).toBe("rt-1");
    expect(first?.captureMode).toBe("full");
    expect(first?.secretKey.startsWith("avlens_")).toBe(true);
    expect(first?.secretKey).not.toContain(UPSTREAM.secretKey);
    expect(second?.secretKey).toBe(first?.secretKey);
    expect(proxy.forRunner("rt-1", undefined)).toBeUndefined();
  });

  test("forwards OTLP trace and log posts with real upstream Basic auth", async () => {
    const seen: { url: string; headers: Headers; body: string }[] = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      seen.push({
        url,
        headers: new Headers(init?.headers),
        body: new TextDecoder().decode(init?.body as Uint8Array),
      });
      return new Response('{"accepted":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const proxy = new LensProxy(
      async () => UPSTREAM,
      () => true,
      fakeFetch,
    );
    const issued = proxy.forRunner("rt-1", UPSTREAM)!;

    for (const path of ["api/public/otel/v1/traces", "api/public/otel/v1/logs"]) {
      const req = new Request(`https://aven.sh/api/runtimes/lens/${path}`, {
        method: "POST",
        headers: {
          authorization: basic(issued.publicKey, issued.secretKey),
          "content-type": "application/json",
        },
        body: '{"resourceSpans":[]}',
      });
      const res = await proxy.forward(req, path);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('{"accepted":true}');
    }

    expect(seen).toHaveLength(2);
    expect(seen[0]?.url).toBe("https://lens.internal:8080/api/public/otel/v1/traces");
    expect(seen[1]?.url).toBe("https://lens.internal:8080/api/public/otel/v1/logs");
    expect(seen[0]?.headers.get("authorization")).toBe(
      basic(UPSTREAM.publicKey, UPSTREAM.secretKey),
    );
    expect(seen[0]?.headers.get("content-type")).toBe("application/json");
    expect(seen[0]?.body).toBe('{"resourceSpans":[]}');
  });

  test("revoking invalidates the old token permanently even after a later run on the same runtime", async () => {
    let clock = 1_000_000;
    let online = false;
    const fakeFetch = (async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    const proxy = new LensProxy(
      async () => UPSTREAM,
      () => online,
      fakeFetch,
      () => clock,
    );
    const first = proxy.forRunner("rt-1", UPSTREAM)!;
    const post = (path: string, auth?: string) =>
      proxy.forward(
        new Request(`https://aven.sh/api/runtimes/lens/${path}`, {
          method: "POST",
          headers: auth ? { authorization: auth } : undefined,
          body: "{}",
        }),
        path,
      );

    expect(
      (
        await proxy.forward(
          new Request("https://aven.sh/api/runtimes/lens/api/public/otel/v1/traces", {
            method: "GET",
          }),
          "api/public/otel/v1/traces",
        )
      ).status,
    ).toBe(405);
    expect((await post("api/v1/projects", basic(first.publicKey, first.secretKey))).status).toBe(
      404,
    );
    expect((await post("api/public/otel/v1/traces")).status).toBe(401);
    expect((await post("api/public/otel/v1/traces", basic("rt-1", "wrong"))).status).toBe(401);

    expect(
      (await post("api/public/otel/v1/traces", basic(first.publicKey, first.secretKey))).status,
    ).toBe(200);

    clock += 6 * 60_000;
    expect(
      (await post("api/public/otel/v1/traces", basic(first.publicKey, first.secretKey))).status,
    ).toBe(401);

    online = true;
    expect(
      (await post("api/public/otel/v1/traces", basic(first.publicKey, first.secretKey))).status,
    ).toBe(200);

    proxy.revoke("rt-1");
    expect(
      (await post("api/public/otel/v1/traces", basic(first.publicKey, first.secretKey))).status,
    ).toBe(401);

    const rotated = proxy.forRunner("rt-1", UPSTREAM)!;
    expect(rotated.secretKey).not.toBe(first.secretKey);
    expect(
      (await post("api/public/otel/v1/traces", basic(first.publicKey, first.secretKey))).status,
    ).toBe(401);
    expect(
      (await post("api/public/otel/v1/traces", basic(rotated.publicKey, rotated.secretKey))).status,
    ).toBe(200);
  });

  test("rejects oversized bodies via content-length or streaming without buffering past the limit", async () => {
    let forwarded = 0;
    const fakeFetch = (async () => {
      forwarded += 1;
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const proxy = new LensProxy(
      async () => UPSTREAM,
      () => true,
      fakeFetch,
      () => 0,
      16,
    );
    const issued = proxy.forRunner("rt-1", UPSTREAM)!;
    const auth = basic(issued.publicKey, issued.secretKey);

    const declaredTooBig = new Request(
      "https://aven.sh/api/runtimes/lens/api/public/otel/v1/traces",
      {
        method: "POST",
        headers: { authorization: auth, "content-length": "64" },
        body: "small",
      },
    );
    expect((await proxy.forward(declaredTooBig, "api/public/otel/v1/traces")).status).toBe(413);

    let chunksRead = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksRead += 1;
        controller.enqueue(new Uint8Array(10));

        if (chunksRead >= 5) controller.close();
      },
    });
    const streamedTooBig = new Request(
      "https://aven.sh/api/runtimes/lens/api/public/otel/v1/traces",
      {
        method: "POST",
        headers: { authorization: auth },
        body: stream,
      },
    );
    expect((await proxy.forward(streamedTooBig, "api/public/otel/v1/traces")).status).toBe(413);
    expect(chunksRead).toBeLessThan(5);
    expect(forwarded).toBe(0);
  });

  test("returns 503 when Lens is disabled and 502 when upstream is unreachable", async () => {
    const offProxy = new LensProxy(
      async () => undefined,
      () => true,
    );
    const offIssued = offProxy.forRunner("rt-1", UPSTREAM)!;
    const req = (token: string) =>
      new Request("https://aven.sh/api/runtimes/lens/api/public/otel/v1/traces", {
        method: "POST",
        headers: { authorization: basic("rt-1", token) },
        body: "{}",
      });

    expect(
      (await offProxy.forward(req(offIssued.secretKey), "api/public/otel/v1/traces")).status,
    ).toBe(503);

    const failingFetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const failProxy = new LensProxy(
      async () => UPSTREAM,
      () => true,
      failingFetch,
    );
    const failIssued = failProxy.forRunner("rt-1", UPSTREAM)!;
    expect(
      (await failProxy.forward(req(failIssued.secretKey), "api/public/otel/v1/traces")).status,
    ).toBe(502);
  });
});
