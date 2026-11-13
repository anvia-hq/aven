import { afterEach, describe, expect, test } from "bun:test";

import { decodeViewerFrame } from "@aven/protocol/viewer-frame";
import { PortTunnels } from "@aven/runtime-client/port-tunnels";

import { PAGE_COOKIE } from "./http-head";
import { startPreviewProxy } from "./proxy";
import { signPreviewToken } from "./token";
import type { ViewerHandle, ViewerSink } from "../runtimes/types";
import type { PreviewClaims } from "./types";
import type { ViewerLink } from "@aven/runtime-client/types";

const domain = "aven.run";
const runtimeId = "00000000-0000-4000-8000-0000000000ab";
const secret = new TextEncoder().encode("the server's secret");
const decoder = new TextDecoder();

let stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
});

function relay() {
  const sinks = new Map<string, ViewerSink>();
  const tunnels: PortTunnels = new PortTunnels({
    send: (message) => {
      if (message.type === "port.closed") sinks.get(message.viewerId)?.closed(message.reason);
    },
    sendBinary: (frame) => {
      const decoded = decodeViewerFrame(frame);

      if (decoded) sinks.get(decoded.viewerId)?.data(decoded.payload);
    },
    buffered: () => 0,
  } satisfies ViewerLink);
  stops.push(() => tunnels.closeAll());
  return async (claims: PreviewClaims, sink: ViewerSink): Promise<ViewerHandle> => {
    const viewerId = crypto.randomUUID();
    sinks.set(viewerId, sink);
    await tunnels.open(viewerId, claims.port);
    return {
      write: (bytes) => tunnels.write(viewerId, bytes),
      close: () => {
        sinks.delete(viewerId);
        tunnels.close(viewerId);
      },
    };
  };
}

async function raw(port: number, request: string) {
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
  await Promise.race([done.promise, Bun.sleep(3000)]);
  socket.end();
  return decoder.decode(Buffer.concat(chunks));
}

describe("a preview end to end", () => {
  test("goes from the host through the runner's loopback to the port and back", async () => {
    const seen: {
      path: string;
      host: string | null;
      origin: string | null;
      cookie: string | null;
    }[] = [];
    const app = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        seen.push({
          path: new URL(request.url).pathname,
          host: request.headers.get("host"),
          origin: request.headers.get("origin"),
          cookie: request.headers.get("cookie"),
        });
        return new Response("hello from the port", {
          headers: { "Content-Type": "text/plain" },
        });
      },
    });
    stops.push(() => app.stop(true));

    const proxy = startPreviewProxy({
      hostname: "127.0.0.1",
      port: 0,
      domain,
      secret,
      open: relay(),
    });
    stops.push(proxy.stop);

    const port = app.port!;
    const claims = { runtimeId, port };
    const page = signPreviewToken(secret, "page", claims, 3_600_000);
    const host = `${port}-${runtimeId}.${domain}`;
    const answer = await raw(
      proxy.port,
      `GET /page HTTP/1.1\r\nHost: ${host}\r\nCookie: ${PAGE_COOKIE}=${page}\r\nOrigin: https://${host}\r\n\r\n`,
    );

    expect(answer).toStartWith("HTTP/1.1 200 OK");
    expect(answer).toContain("Referrer-Policy: no-referrer");
    expect(answer).toEndWith("hello from the port");

    expect(seen).toEqual([
      {
        path: "/page",
        host: `localhost:${port}`,
        origin: `http://localhost:${port}`,
        cookie: null,
      },
    ]);
  });
});
