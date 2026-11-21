import { describe, expect, test } from "bun:test";
import type { RunMcpServer } from "@aven/protocol/types";

import { McpConnectionPool } from "./connection-pool";
import type { ConnectedMcp } from "../types";

const server = (id: string): RunMcpServer => ({
  id,
  name: id,
  url: `https://${id}.example.com/mcp`,
  headers: {},
  allowLocal: false,
});

function fakeConnection(id: string) {
  let closed = false;
  const connected: ConnectedMcp = {
    tools: [],
    servers: [],
    results: [{ id }],
    note: { servers: [], failed: [] },
    close: async () => {
      closed = true;
    },
  };
  return { connected, isClosed: () => closed };
}

describe("McpConnectionPool", () => {
  test("coalesces concurrent connects waiting behind an in-flight connect for a different key", async () => {
    const pool = new McpConnectionPool();
    const firstGate = Promise.withResolvers<void>();
    const secondGate = Promise.withResolvers<void>();
    const opened: { key: string; isClosed: () => boolean }[] = [];

    const open = async (configs: readonly RunMcpServer[]) => {
      const id = configs[0]!.id;
      const entry = fakeConnection(id);
      opened.push({ key: id, isClosed: entry.isClosed });

      if (id === "a") await firstGate.promise;
      else await secondGate.promise;

      return entry.connected;
    };

    const p1 = pool.connect("thread-1", [server("a")], open);
    await Bun.sleep(0);
    const p2 = pool.connect("thread-1", [server("b")], open);
    const p3 = pool.connect("thread-1", [server("b")], open);

    firstGate.resolve();
    await Bun.sleep(0);
    secondGate.resolve();

    const [c1, c2, c3] = await Promise.all([p1, p2, p3]);
    expect(opened.map((entry) => entry.key)).toEqual(["a", "b"]);
    expect(c2).toBe(c3);
    expect(c2).not.toBe(c1);
    expect(opened[0]!.isClosed()).toBe(true);
    expect(opened[1]!.isClosed()).toBe(false);

    await pool.close();
    expect(opened[1]!.isClosed()).toBe(true);
  });

  test("closes an in-flight connection when the pool closes before it finishes", async () => {
    const pool = new McpConnectionPool();
    const gate = Promise.withResolvers<void>();
    const entry = fakeConnection("a");

    const connecting = pool.connect("thread-1", [server("a")], async () => {
      await gate.promise;
      return entry.connected;
    });
    await Bun.sleep(0);

    const closing = pool.close();
    gate.resolve();
    await Promise.all([connecting, closing]);

    expect(entry.isClosed()).toBe(true);
    expect(pool.get("thread-1")).toBeUndefined();
  });
});
