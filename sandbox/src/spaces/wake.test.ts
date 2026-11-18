import { describe, expect, test } from "bun:test";

import { FRESH_JOURNAL_COMMAND } from "../fresh-journal";
import { SPACES_BOOT_COMMAND, SPACES_BOOT_PATH } from "./boot";
import { SpacesApiError, SpacesClient } from "./client";
import { wakeSpacesSandbox } from "./wake";
import type { SpacesWake } from "./types";
import type { SandboxClock, SandboxRecord } from "../types";

const KEY = "sk_test_key_value";
const TOKEN = "avrt_runner_token_value";
const ID = "bx_23456789";
const NEXT = "bx_abcdef23";
const BASE = "https://spaces.test/api/v1";

function timed() {
  let time = 0;
  const clock: SandboxClock = {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  };
  return { clock, at: () => time };
}

function record(sandboxId: string | null): SandboxRecord {
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
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });

    if (method === "POST" && url.endsWith("/sandboxes")) {
      const created = states.create?.shift() ?? ID;
      return Response.json({ ok: true, sandbox: { id: created, state: "provisioning" } });
    }

    const id = url.split("/sandboxes/")[1]?.split("/")[0];

    if (method === "GET" && id) {
      const state = states[id]?.shift() ?? "ready";

      if (state === "missing")
        return Response.json({ ok: false, code: "not_found", message: "no" }, { status: 404 });

      return Response.json({ ok: true, sandbox: { id, state } });
    }

    if (url.endsWith("/commands")) onCommand?.();

    return Response.json({ ok: true, type: "ok" });
  }) as typeof fetch;
  return { calls, client: new SpacesClient(BASE, fetchFn) };
}

const wake = (
  overrides: Pick<SpacesWake, "record" | "client" | "connected"> & Partial<SpacesWake>,
): SpacesWake => ({
  runnerUrl: "https://aven.example.com/api",
  saveSandboxId: async () => undefined,
  ...overrides,
});

describe("waking a spaces sandbox", () => {
  test("creates one, waits for it, writes the token to a file and starts the runner without the token in the command", async () => {
    let online = false;
    const saved: string[] = [];
    const { calls, client } = scripted({ create: [ID], [ID]: ["provisioning", "ready"] }, () => {
      online = true;
    });
    const { clock } = timed();

    const woke = await wakeSpacesSandbox(
      wake({
        record: record(null),
        client,
        saveSandboxId: async (id) => {
          saved.push(id);
        },
        connected: () => online,
        clock,
      }),
    );

    expect(woke).toEqual({ started: true });
    expect(saved).toEqual([ID]);
    expect(calls.map((call) => `${call.method} ${call.url.replace(BASE, "")}`)).toEqual([
      "POST /sandboxes",
      `GET /sandboxes/${ID}`,
      `GET /sandboxes/${ID}`,
      `POST /sandboxes/${ID}/commands`,
      `PUT /sandboxes/${ID}/files`,
      `POST /sandboxes/${ID}/commands`,
    ]);
    expect(calls[3]?.body).toEqual({ command: "mkdir -p /home/user/.aven" });
    const file = calls[4]?.body as { path: string; content: string };
    expect(file.path).toBe(SPACES_BOOT_PATH);
    expect(file.content).toContain(TOKEN);
    expect(file.content).not.toContain("AVEN_RELEASE");
    expect(calls[5]?.body).toEqual({
      command: SPACES_BOOT_COMMAND,
      detached: true,
      timeoutSeconds: 600,
    });
    expect(JSON.stringify(calls[5]?.body)).not.toContain(TOKEN);
  });

  test("tells the sandbox which release this server runs, so its runner can be brought to it", async () => {
    let online = false;
    const { calls, client } = scripted({ create: [ID], [ID]: ["ready"] }, () => {
      online = true;
    });
    const { clock } = timed();

    await wakeSpacesSandbox(
      wake({
        record: record(null),
        client,
        release: "0.10.5",
        connected: () => online,
        clock,
      }),
    );

    const file = calls.find((call) => call.method === "PUT")?.body as { content: string };
    expect(file.content).toContain("AVEN_RELEASE=0.10.5\n");
  });

  test("clears the runner's journal before booting a sandbox started from a saved environment", async () => {
    let online = false;
    const { calls, client } = scripted({ create: [ID], [ID]: ["ready"] }, () => {
      online = true;
    });
    const { clock } = timed();

    await wakeSpacesSandbox(
      wake({
        record: { ...record(null), environment: "aven-project" },
        client,
        connected: () => online,
        clock,
      }),
    );

    expect(calls[2]?.body).toEqual({ command: FRESH_JOURNAL_COMMAND });
  });

  test("clears the journal even when the runner of the saved environment connects by itself", async () => {
    const { calls, client } = scripted({ create: [ID], [ID]: ["ready"] });
    const { clock } = timed();

    await wakeSpacesSandbox(
      wake({
        record: { ...record(null), environment: "aven-project" },
        client,
        connected: () => true,
        clock,
      }),
    );

    expect(calls.map((call) => call.body)).toContainEqual({ command: FRESH_JOURNAL_COMMAND });
  });

  test("deletes the sandbox it created when the journal cannot be cleared, so the next wake starts again from the environment", async () => {
    const { calls, client } = scripted({ create: [ID], [ID]: ["ready"] });
    client.command = async () => {
      throw new Error("unreachable");
    };
    const { clock } = timed();

    await expect(
      wakeSpacesSandbox(
        wake({
          record: { ...record(null), environment: "aven-project" },
          client,
          connected: () => false,
          clock,
        }),
      ),
    ).rejects.toThrow();

    expect(calls.map((call) => `${call.method} ${call.url.replace(BASE, "")}`)).toContain(
      `DELETE /sandboxes/${ID}`,
    );
  });

  test("creates the sandbox from the image when the saved environment is gone", async () => {
    let online = false;
    const { calls, client } = scripted({ create: [ID], [ID]: ["ready"] }, () => {
      online = true;
    });
    const create = client.createSandbox.bind(client);
    const sources: (string | null | undefined)[] = [];
    client.createSandbox = async (apiKey, input) => {
      sources.push(input.from);

      if (input.from) throw new SpacesApiError(404, "not_found", "snapshot_not_found");

      return create(apiKey, input);
    };
    const { clock } = timed();

    await wakeSpacesSandbox(
      wake({
        record: { ...record(null), environment: "aven-project" },
        client,
        connected: () => online,
        clock,
      }),
    );

    expect(sources).toEqual(["aven-project", null]);
    expect(calls.map((call) => call.body)).not.toContainEqual({ command: FRESH_JOURNAL_COMMAND });
  });

  test("starts the runner at once after a resume, which ends every process, and lets go of the old connection", async () => {
    const { clock, at } = timed();
    let online = false;
    let bootedAt: number | undefined;
    let forgotten = 0;
    const { calls, client } = scripted({ [ID]: ["archived", "ready"] }, () => {
      bootedAt = at();
      online = true;
    });

    const woke = await wakeSpacesSandbox(
      wake({
        record: record(ID),
        client,
        connected: () => online,
        forget: () => {
          forgotten += 1;
        },
        clock,
      }),
    );

    expect(woke).toEqual({ started: true });
    expect(forgotten).toBe(1);
    expect(bootedAt).toBe(0);
    expect(calls.some((call) => call.url.endsWith("/resume"))).toBe(true);
  });

  test("gives a runner that is merely reconnecting time before it starts another", async () => {
    const { clock, at } = timed();
    let online = false;
    let bootedAt: number | undefined;
    const { client } = scripted({ [ID]: ["ready"] }, () => {
      bootedAt = at();
      online = true;
    });

    const woke = await wakeSpacesSandbox(
      wake({
        record: record(ID),
        client,
        connected: () => online,
        clock,
      }),
    );

    expect(woke).toEqual({ started: false });
    expect(bootedAt).toBeGreaterThanOrEqual(10_000);
  });

  test("leaves a runner that is already connected alone", async () => {
    const { calls, client } = scripted({ [ID]: ["ready"] });

    const woke = await wakeSpacesSandbox(
      wake({
        record: record(ID),
        client,
        connected: () => true,
        clock: timed().clock,
      }),
    );

    expect(woke).toEqual({ started: false });
    expect(calls.map((call) => call.method)).toEqual(["GET"]);
  });

  test("replaces a sandbox spaces no longer has", async () => {
    const saved: string[] = [];
    let online = false;
    const { client } = scripted({ [ID]: ["missing"], create: [NEXT] }, () => {
      online = true;
    });

    await wakeSpacesSandbox(
      wake({
        record: record(ID),
        client,
        saveSandboxId: async (id) => {
          saved.push(id);
        },
        connected: () => online,
        clock: timed().clock,
      }),
    );

    expect(saved).toEqual([NEXT]);
  });

  test("says so when the runner never connects, and when the server cannot be reached", async () => {
    const { client } = scripted({ [ID]: ["ready"] });

    await expect(
      wakeSpacesSandbox(
        wake({
          record: record(ID),
          client,
          connected: () => false,
          clock: timed().clock,
          settleMs: 0,
          connectTimeoutMs: 5_000,
        }),
      ),
    ).rejects.toThrow(`The spaces sandbox ${ID} did not connect`);

    const down = new SpacesClient(BASE, (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);

    await expect(
      wakeSpacesSandbox(
        wake({
          record: record(null),
          client: down,
          connected: () => false,
          clock: timed().clock,
        }),
      ),
    ).rejects.toThrow("Could not reach the spaces server");
  });

  test("does not wait forever for a sandbox that stays provisioning", async () => {
    const { client } = scripted({ [ID]: Array(200).fill("provisioning") });

    await expect(
      wakeSpacesSandbox(
        wake({
          record: record(ID),
          client,
          connected: () => false,
          clock: timed().clock,
          readyTimeoutMs: 5_000,
        }),
      ),
    ).rejects.toThrow("still provisioning");
  });
});
