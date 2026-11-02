import { afterEach, describe, expect, test } from "bun:test";

import { portIsFree, waitForHealthy } from "./health";

const fast = { intervalMs: 1, sleep: async () => {} };

describe("waitForHealthy", () => {
  test("is true once the URL answers, after failures and bad statuses", async () => {
    const answers = [
      () => Promise.reject(new Error("refused")),
      () => new Response("", { status: 503 }),
      () => new Response("ok"),
    ];
    let calls = 0;
    const fetchFn = (() => answers[calls++]!()) as unknown as typeof fetch;
    expect(await waitForHealthy("http://x/health", { ...fast, fetchFn })).toBe(true);
    expect(calls).toBe(3);
  });

  test("gives up when the time is out", async () => {
    const fetchFn = (() => Promise.reject(new Error("refused"))) as unknown as typeof fetch;
    expect(await waitForHealthy("http://x/health", { ...fast, timeoutMs: 5, fetchFn })).toBe(false);
  });
});

test("portIsFree sees a port that is taken", () => {
  const taken = Bun.listen({ hostname: "0.0.0.0", port: 0, socket: { data() {} } });
  expect(portIsFree(taken.port)).toBe(false);
  const { port } = taken;
  taken.stop(true);
  expect(portIsFree(port)).toBe(true);
});

describe("portIsFree and the addresses a port is held on", () => {
  const open: { stop(close?: boolean): void }[] = [];
  afterEach(() => {
    for (const socket of open.splice(0)) socket.stop(true);
  });
  const listenOn = (hostname: string) => {
    const socket = Bun.listen({ hostname, port: 0, socket: { data() {} } });
    open.push(socket);
    return socket.port;
  };

  test("a port only loopback is bound on is taken, as another Aven's API port is", () => {
    expect(portIsFree(listenOn("127.0.0.1"))).toBe(false);
  });

  test("a port bound on every address is taken", () => {
    expect(portIsFree(listenOn("0.0.0.0"))).toBe(false);
  });
});
