import { describe, expect, test } from "bun:test";

import { BOAT_BOOT_COMMAND, BOAT_BOOT_PATH } from "./boot";
import { BoatClient } from "./client";
import { wakeBoatSandbox } from "./wake";
import type { BoatClock, BoatWakeRecord } from "./types";

const KEY = "boat_test_key_value";
const TOKEN = "avrt_runner_token_value";
const ID = "bx_23456789";
const NEXT = "bx_abcdef23";

function clock(): BoatClock {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  };
}

function record(sandboxId: string | null): BoatWakeRecord {
  return {
    runtimeId: "11111111-1111-4111-8111-111111111111",
    apiKey: KEY,
    runnerToken: TOKEN,
    sandboxId,
    machineType: "default",
  };
}

function scripted(states: Record<string, string[]>, onCommand?: () => void) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });

    if (method === "POST" && url.endsWith("/sandboxes")) {
      const created = states.create?.shift() ?? ID;
      return Response.json({
        ok: true,
        type: "sandbox.created",
        sandbox: { id: created, state: "ready", dataExpiredAt: null },
      });
    }

    const id = url.split("/sandboxes/")[1]?.split("/")[0];

    if (method === "GET" && id) {
      const state = states[id]?.shift() ?? "ready";

      if (state === "missing")
        return Response.json({ ok: false, code: "not_found", message: "missing" }, { status: 404 });

      return Response.json({
        ok: true,
        type: "sandbox.info",
        sandbox: { id, state, dataExpiredAt: null },
      });
    }

    if (url.endsWith("/commands")) onCommand?.();

    return Response.json({ ok: true, type: "ok" });
  }) as typeof fetch;
  return { calls, fetchFn };
}

describe("waking a boat sandbox", () => {
  test("creates one, writes the runner token into a file, and boots without putting the token in the command", async () => {
    let online = false;
    const saved: string[] = [];
    const { calls, fetchFn } = scripted({ create: [ID] }, () => {
      online = true;
    });
    const client = new BoatClient(fetchFn, "https://boat.test/api/v1");

    await wakeBoatSandbox({
      record: record(null),
      client,
      runnerUrl: "https://aven.example.com/api",
      saveSandboxId: async (id) => {
        saved.push(id);
      },
      connected: () => online,
      clock: clock(),
      settleMs: 0,
    });

    expect(saved).toEqual([ID]);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST https://boat.test/api/v1/sandboxes",
      `GET https://boat.test/api/v1/sandboxes/${ID}`,
      `POST https://boat.test/api/v1/sandboxes/${ID}/commands`,
      `PUT https://boat.test/api/v1/sandboxes/${ID}/files`,
      `POST https://boat.test/api/v1/sandboxes/${ID}/commands`,
    ]);
    expect(calls[2]?.body).toEqual({ command: "mkdir -p /home/user/.aven" });
    const file = calls[3]?.body as { path: string; content: string };
    expect(file.path).toBe(BOAT_BOOT_PATH);
    expect(file.content).toContain(TOKEN);
    expect(file.content).toContain("https://aven.example.com/api");
    expect(calls[4]?.body).toEqual({ command: BOAT_BOOT_COMMAND, detached: true });
    expect(JSON.stringify(calls[4]?.body)).not.toContain(TOKEN);
  });

  test("resumes a stopped sandbox", async () => {
    const { calls, fetchFn } = scripted({ [ID]: ["archived", "ready"] });
    const client = new BoatClient(fetchFn, "https://boat.test/api/v1");

    await wakeBoatSandbox({
      record: record(ID),
      client,
      runnerUrl: "https://aven.example.com/api",
      saveSandboxId: async () => undefined,
      connected: () => true,
      clock: clock(),
      settleMs: 0,
    });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET https://boat.test/api/v1/sandboxes/${ID}`,
      `POST https://boat.test/api/v1/sandboxes/${ID}/resume`,
      `GET https://boat.test/api/v1/sandboxes/${ID}`,
    ]);
  });

  test("replaces a sandbox boat no longer has", async () => {
    const saved: string[] = [];
    const { calls, fetchFn } = scripted({
      [ID]: ["missing"],
      create: [NEXT],
      [NEXT]: ["ready"],
    });
    const client = new BoatClient(fetchFn, "https://boat.test/api/v1");

    await wakeBoatSandbox({
      record: record(ID),
      client,
      runnerUrl: "https://aven.example.com/api",
      saveSandboxId: async (id) => {
        saved.push(id);
      },
      connected: () => true,
      clock: clock(),
      settleMs: 0,
    });

    expect(saved).toEqual([NEXT]);
    expect(calls[0]?.url).toContain(ID);
    expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/sandboxes"))).toBe(
      true,
    );
  });
});
