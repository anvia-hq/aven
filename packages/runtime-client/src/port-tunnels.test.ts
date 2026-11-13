import { afterEach, describe, expect, test } from "bun:test";

import { decodeViewerFrame } from "@aven/protocol/viewer-frame";

import { PortTunnels } from "./port-tunnels";
import type { RuntimeToControlPlane } from "@aven/protocol/types";
import type { ViewerLink } from "./types";

type Sent = { messages: RuntimeToControlPlane[]; frames: Uint8Array[] };

const viewerId = "00000000-0000-4000-8000-0000000000aa";
const decoder = new TextDecoder();

let stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
});

function link(sent: Sent): ViewerLink {
  return {
    send: (message) => void sent.messages.push(message),
    sendBinary: (frame) => void sent.frames.push(frame),
    buffered: () => 0,
  };
}

async function waitFor<T>(read: () => T | undefined) {
  const started = Date.now();

  while (Date.now() - started < 3_000) {
    const value = read();

    if (value !== undefined) return value;

    await Bun.sleep(10);
  }

  throw new Error("Timed out");
}

const received = (sent: Sent) =>
  sent.frames
    .map((frame) => decodeViewerFrame(frame))
    .filter((frame) => frame !== null)
    .map((frame) => decoder.decode(frame.payload))
    .join("");

describe("a port of a runner", () => {
  test("is opened on the runner's own loopback, carried both ways, and closed", async () => {
    const server = Bun.listen<{ sockets: Set<unknown> }>({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        open(socket) {
          socket.write("hello from the port\n");
        },
        data(socket, bytes) {
          socket.write(bytes);
        },
      },
    });
    stops.push(() => server.stop(true));

    const sent: Sent = { messages: [], frames: [] };
    const tunnels = new PortTunnels(link(sent));
    stops.push(() => tunnels.closeAll());

    await tunnels.open(viewerId, server.port);
    await waitFor(() => sent.messages.find((message) => message.type === "port.opened"));
    await waitFor(() => (received(sent).includes("hello") ? true : undefined));

    tunnels.write(viewerId, new TextEncoder().encode("ping"));
    await waitFor(() => (received(sent).includes("ping") ? true : undefined));

    server.stop(true);
    const closed = await waitFor(() =>
      sent.messages.find((message) => message.type === "port.closed"),
    );
    expect(closed).toMatchObject({ type: "port.closed", viewerId });
  });

  test("is refused when it is a port another service owns", async () => {
    const sent: Sent = { messages: [], frames: [] };
    const tunnels = new PortTunnels(link(sent));

    for (const port of [22, 2375, 5432, 5900]) {
      await tunnels.open(viewerId, port);
      const closed = sent.messages.at(-1);
      expect(closed).toMatchObject({ type: "port.closed", viewerId });
      expect((closed as { reason: string }).reason).toContain("not a preview");
    }

    expect(sent.frames).toEqual([]);
  });

  test("says so when nothing listens on it", async () => {
    const server = Bun.listen<undefined>({
      hostname: "127.0.0.1",
      port: 0,
      socket: { data() {}, open() {} },
    });
    const port = server.port;
    server.stop(true);

    const sent: Sent = { messages: [], frames: [] };
    const tunnels = new PortTunnels(link(sent));
    await tunnels.open(viewerId, port);

    const closed = await waitFor(() =>
      sent.messages.find((message) => message.type === "port.closed"),
    );
    expect((closed as { reason: string }).reason.length).toBeGreaterThan(0);
    expect(sent.messages.some((message) => message.type === "port.opened")).toBe(false);
  });

  test("forgets a tunnel that is closed", async () => {
    const server = Bun.listen<undefined>({
      hostname: "127.0.0.1",
      port: 0,
      socket: { data() {}, open() {} },
    });
    stops.push(() => server.stop(true));

    const sent: Sent = { messages: [], frames: [] };
    const tunnels = new PortTunnels(link(sent));
    await tunnels.open(viewerId, server.port);
    await waitFor(() => sent.messages.find((message) => message.type === "port.opened"));

    tunnels.close(viewerId);
    expect(tunnels.has(viewerId)).toBe(false);
  });
});
