import { describe, expect, test } from "bun:test";
import { decodeViewerFrame } from "@aven/protocol/viewer-frame";

import { PortTunnels } from "./port-tunnels";
import { fakeTunnel } from "./testing/fake-tunnel";
import type { RuntimeToControlPlane } from "@aven/protocol/types";
import type { ThreadWorkspaces } from "./types";
import type { SandboxTunnel } from "@anvia/sandbox/remote";

const viewerId = crypto.randomUUID();

function setup(tunnel: SandboxTunnel | undefined) {
  const sent: RuntimeToControlPlane[] = [];
  const frames: Uint8Array[] = [];
  const link = { buffered: 0 };
  const sandbox = { tunnel: () => tunnel } as unknown as ThreadWorkspaces;
  const ports = new PortTunnels(sandbox, {
    send: (message) => void sent.push(message),
    sendBinary: (frame) => void frames.push(frame),
    buffered: () => link.buffered,
  });
  return { ports, sent, frames };
}

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await Bun.sleep(10);
  expect(condition()).toBe(true);
};

describe("PortTunnels", () => {
  test("a thread whose sandbox is not running has no port to show", async () => {
    const { ports, sent } = setup(undefined);
    await ports.open(viewerId, "t1", 3000);
    expect(sent).toEqual([{ type: "port.closed", viewerId, reason: "The sandbox is not running" }]);
    expect(ports.count("t1")).toBe(0);
  });

  test("refuses what is not a port, and the desktop's own", async () => {
    const fake = fakeTunnel();
    const { ports, sent } = setup(fake.tunnel);
    await ports.open(viewerId, "t1", 0);
    await ports.open(viewerId, "t1", 70000);
    await ports.open(viewerId, "t1", 5900);
    expect(sent.map((message) => (message as { reason: string }).reason)).toEqual([
      "That is not a port",
      "That is not a port",
      "That port is not shown",
    ]);
    expect(fake.record.opened).toEqual([]);
  });

  test("relays the port's bytes as frames, and the browser's bytes back", async () => {
    const fake = fakeTunnel();
    const { ports, sent, frames } = setup(fake.tunnel);
    await ports.open(viewerId, "t1", 3000);
    expect(fake.record.opened).toEqual([3000]);
    expect(sent).toEqual([{ type: "port.opened", viewerId }]);
    expect(ports.count("t1")).toBe(1);
    expect(ports.has(viewerId)).toBe(true);

    await fake.push(new TextEncoder().encode("HTTP/1.1 200 OK"));
    await until(() => frames.length === 1);
    expect(decodeViewerFrame(frames[0]!)?.viewerId).toBe(viewerId);
    expect(new TextDecoder().decode(decodeViewerFrame(frames[0]!)?.payload)).toBe(
      "HTTP/1.1 200 OK",
    );

    ports.write(viewerId, new TextEncoder().encode("GET /"));
    await until(() => fake.record.written.length === 1);
  });

  test("closing a tunnel stops it without telling the control plane", async () => {
    const fake = fakeTunnel();
    const { ports, sent } = setup(fake.tunnel);
    await ports.open(viewerId, "t1", 3000);
    ports.close(viewerId);
    expect(fake.record.closed).toBe(true);
    expect(ports.count("t1")).toBe(0);
    await Bun.sleep(30);
    expect(sent).toEqual([{ type: "port.opened", viewerId }]);
  });

  test("tells the control plane when the port closes the connection", async () => {
    const fake = fakeTunnel();
    const { ports, sent } = setup(fake.tunnel);
    await ports.open(viewerId, "t1", 3000);
    await fake.end();
    await until(() => sent.length === 2);
    expect(sent[1]).toEqual({
      type: "port.closed",
      viewerId,
      reason: "The port closed the connection",
    });
    expect(ports.count("t1")).toBe(0);
  });
});
