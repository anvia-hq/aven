import { describe, expect, test } from "bun:test";

import { UnavailableError } from "@aven/server-kit/errors";

import { RuntimeOfflineError } from "../offline";
import type { RuntimeConnection } from "../hub";
import { BoatClient } from "./client";
import { createBoatProvider } from "./provider";
import { stopBoatSandbox } from "./stop";
import type { BoatClock, BoatWakeRecord } from "./types";

const ID = "bx_23456789";

function clock(): BoatClock {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  };
}

function record(): BoatWakeRecord {
  return {
    runtimeId: "runtime-1",
    apiKey: "boat_test_key_value",
    runnerToken: "avrt_runner_token_value",
    sandboxId: null,
    machineType: "small",
  };
}

describe("boat runtime provider", () => {
  test("one wake is shared, and releasing a thread asks the runner", async () => {
    let online = false;
    const creates: string[] = [];
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (init?.method === "POST" && url.endsWith("/sandboxes")) {
        creates.push(url);
        return Response.json({
          ok: true,
          sandbox: { id: ID, state: "ready", dataExpiredAt: null },
        });
      }

      if (url.endsWith("/commands")) online = true;

      if (init?.method === "GET")
        return Response.json({
          ok: true,
          sandbox: { id: ID, state: "ready", dataExpiredAt: null },
        });

      return Response.json({ ok: true, type: "ok" });
    }) as typeof fetch;
    const connection = { call: async () => ({ released: true }) } as unknown as RuntimeConnection;
    const hub = { get: () => (online ? connection : undefined) };
    const provider = createBoatProvider({
      hub,
      load: async () => record(),
      saveSandboxId: async () => undefined,
      client: new BoatClient(fetchFn, "https://boat.test/api/v1"),
      runnerUrl: () => "https://aven.example.com/api",
      clock: clock(),
    });

    const [first, second] = await Promise.all([
      provider.start({ runtimeId: "runtime-1", threadId: "t1" }),
      provider.start({ runtimeId: "runtime-1", threadId: "t2" }),
    ]);
    expect(first).toBe(connection);
    expect(second).toBe(connection);
    expect(creates).toEqual(["https://boat.test/api/v1/sandboxes"]);

    const released: unknown[] = [];
    await provider.release({ runtimeId: "runtime-1", threadId: "t1" }, {
      call: async (method: string, params: unknown) => {
        released.push({ method, params });
        return { released: true };
      },
    } as unknown as RuntimeConnection);
    expect(released).toEqual([{ method: "sandbox.release", params: { threadId: "t1" } }]);
  });

  test("a runtime without a saved key is offline", async () => {
    const provider = createBoatProvider({
      hub: { get: () => undefined },
      load: async () => null,
      saveSandboxId: async () => undefined,
      runnerUrl: () => "https://aven.example.com/api",
    });

    await expect(provider.start({ runtimeId: "missing" })).rejects.toBeInstanceOf(
      RuntimeOfflineError,
    );
  });

  test("stopping an archived sandbox does nothing, and a server error is reported", async () => {
    const calls: string[] = [];
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);

      if (String(input).endsWith("/stop"))
        return Response.json({ ok: false, code: "http_500", message: "nope" }, { status: 500 });

      return Response.json({
        ok: true,
        sandbox: {
          id: ID,
          state: calls.length === 1 ? "archived" : "running",
          dataExpiredAt: null,
        },
      });
    }) as typeof fetch;
    const client = new BoatClient(fetchFn, "https://boat.test/api/v1");
    const running = { ...record(), sandboxId: ID };

    await stopBoatSandbox(running, client);
    expect(calls).toEqual([`GET https://boat.test/api/v1/sandboxes/${ID}`]);

    await expect(stopBoatSandbox(running, client)).rejects.toBeInstanceOf(UnavailableError);
  });
});
