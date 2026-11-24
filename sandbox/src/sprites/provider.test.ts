import { afterEach, describe, expect, test } from "bun:test";

import { UnavailableError } from "@aven/server-kit/errors";

import { SpritesClient } from "./client";
import { createSpritesProvider } from "./provider";
import { setSandboxSettings } from "../settings";
import type { SandboxRecord, SandboxRunner } from "../types";

const NAME = "aven-abc";

const record: SandboxRecord = {
  runtimeId: "3ea9bc16-9e0d-47bf-aff5-8c5d6d1b38db",
  apiKey: "anvia/org-id/token-id/secret",
  runnerToken: "avrt_token",
  sandboxId: NAME,
  machineType: "default",
};

const connection: SandboxRunner = { call: async () => ({}) };

afterEach(() => setSandboxSettings(null));

type Reply = (path: string, method: string, body: string) => Response | undefined;

function setup(options: {
  online?: boolean;
  sandboxRecord?: SandboxRecord | null;
  replies?: Reply;
  onExec?: () => void;
}) {
  const calls: string[] = [];
  const loads: (boolean | undefined)[] = [];
  const saved: string[] = [];
  let online = options.online ?? true;
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? String(init.body) : "";
    calls.push(`${method} ${url.pathname}`);

    if (method === "POST" && url.pathname.endsWith("/exec")) options.onExec?.();

    return (
      options.replies?.(url.pathname, method, body) ??
      Response.json({ id: "sprite-1", name: NAME, status: "running", url: null })
    );
  }) as typeof fetch;
  const provider = createSpritesProvider({
    hub: { get: () => (online ? connection : undefined), disconnect: () => (online = false) },
    record: async ({ revoked }) => {
      loads.push(revoked);
      return options.sandboxRecord === undefined ? record : options.sandboxRecord;
    },
    saveSandboxId: async (_runtimeId, sandboxId) => {
      saved.push(sandboxId);
    },
    apiKey: () => record.apiKey,
    client: () => new SpritesClient(fetchFn, "https://api.sprites.test"),
    runnerUrl: () => "https://aven.example.com/api",
    release: () => undefined,
    clock: { now: () => 0, sleep: async () => undefined },
  });
  return {
    provider,
    calls,
    loads,
    saved,
    setOnline: (value: boolean) => {
      online = value;
    },
  };
}

describe("the sprites provider", () => {
  test("is the sprites kind and returns the runner that is already connected", async () => {
    const { provider, calls } = setup({});

    expect(provider.kind).toBe("sprites");
    expect(await provider.start({ runtimeId: record.runtimeId, threadId: "t" })).toBe(connection);
    expect(calls).toEqual([`GET /v1/sprites/${NAME}`]);
  });

  test("starts a computer once for threads that ask together", async () => {
    const { provider, calls } = setup({});
    const [a, b] = await Promise.all([
      provider.start({ runtimeId: record.runtimeId, threadId: "t1" }),
      provider.start({ runtimeId: record.runtimeId, threadId: "t2" }),
    ]);

    expect(a).toBe(b);
    expect(calls).toEqual([`GET /v1/sprites/${NAME}`]);
  });

  test("creates a Sprite when the thread has none, then writes the boot file and starts the runner", async () => {
    const harness = setup({
      online: false,
      sandboxRecord: { ...record, sandboxId: null },
      replies: (path, method) => {
        if (method === "GET") return Response.json({ error: "not found" }, { status: 404 });

        if (method === "POST" && path === "/v1/sprites") {
          return Response.json(
            { id: "sprite-1", name: "aven-3ea9bc169e0d47bfaff58c5d", status: "cold", url: null },
            { status: 201 },
          );
        }

        if (method === "PUT" && path.endsWith("/fs/write")) return Response.json({ size: 1 });

        if (method === "POST" && path.endsWith("/exec"))
          return Response.json({ stdout: "", stderr: "", exitCode: 0 });

        return undefined;
      },
      onExec: () => harness.setOnline(true),
    });

    const runner = await harness.provider.start({ runtimeId: record.runtimeId, threadId: "t1" });

    expect(runner).toBe(connection);
    expect(harness.saved).toEqual(["aven-3ea9bc169e0d47bfaff58c5d"]);
    expect(harness.calls).toEqual([
      `GET /v1/sprites/aven-3ea9bc169e0d47bfaff58c5d`,
      "POST /v1/sprites",
      `PUT /v1/sprites/aven-3ea9bc169e0d47bfaff58c5d/fs/write`,
      `POST /v1/sprites/aven-3ea9bc169e0d47bfaff58c5d/exec`,
    ]);
  });

  test("creates the Sprite its row names again when Sprites has lost it", async () => {
    const harness = setup({
      online: false,
      replies: (path, method) => {
        if (method === "GET") return Response.json({ error: "gone" }, { status: 404 });

        if (method === "POST" && path === "/v1/sprites")
          return Response.json(
            { id: "sprite-1", name: NAME, status: "cold", url: null },
            {
              status: 201,
            },
          );

        return Response.json({});
      },
      onExec: () => harness.setOnline(true),
    });

    await harness.provider.start({ runtimeId: record.runtimeId, threadId: "t1" });

    expect(harness.saved).toEqual([NAME]);
    expect(harness.calls[0]).toBe(`GET /v1/sprites/${NAME}`);
    expect(harness.calls[1]).toBe("POST /v1/sprites");
  });

  test("boots the runner of a Sprite that is there but no longer connected", async () => {
    const harness = setup({ online: false, onExec: () => harness.setOnline(true) });

    const runner = await harness.provider.start({ runtimeId: record.runtimeId, threadId: "t1" });

    expect(runner).toBe(connection);
    expect(harness.calls).toEqual([
      `GET /v1/sprites/${NAME}`,
      `PUT /v1/sprites/${NAME}/fs/write`,
      `POST /v1/sprites/${NAME}/exec`,
    ]);
  });

  test("fails with the boot output when the runner cannot be started", async () => {
    const harness = setup({
      online: false,
      replies: (_path, method) =>
        method === "POST"
          ? Response.json({ stdout: "", stderr: "no space left on device", exitCode: 1 })
          : undefined,
    });

    const started = harness.provider.start({ runtimeId: record.runtimeId, threadId: "t1" });

    await expect(started).rejects.toThrow("no space left on device");
  });

  test("stops a computer by ending its runner and releasing its hold", async () => {
    const { provider, calls, loads } = setup({});

    await provider.stop(record.runtimeId);

    expect(loads).toEqual([true]);
    expect(calls).toEqual([`POST /v1/sprites/${NAME}/exec`]);
  });

  test("tolerates a computer Sprites no longer has when stopping", async () => {
    const harness = setup({
      replies: () => Response.json({ error: "not found" }, { status: 404 }),
    });
    const error = console.error;
    console.error = () => {};

    try {
      await harness.provider.stop(record.runtimeId);
    } finally {
      console.error = error;
    }
  });

  test("destroys a Sprite and treats 404 as destroyed", async () => {
    const { provider, calls } = setup({});
    await provider.destroy(NAME);
    expect(calls).toEqual([`DELETE /v1/sprites/${NAME}`]);

    const gone = setup({ replies: () => Response.json({ error: "gone" }, { status: 404 }) });
    await gone.provider.destroy(NAME);

    const failing = setup({
      replies: () => Response.json({ error: "backend down" }, { status: 502 }),
    });
    await expect(failing.provider.destroy(NAME)).rejects.toThrow("backend down");
  });

  test("cannot destroy anything without a token", async () => {
    const provider = createSpritesProvider({
      hub: { get: () => undefined },
      record: async () => null,
      saveSandboxId: async () => undefined,
      apiKey: () => null,
    });

    await expect(provider.destroy(NAME)).rejects.toBeInstanceOf(UnavailableError);
  });
});
