import { afterEach, describe, expect, test } from "bun:test";

import { UnavailableError } from "@aven/server-kit/errors";

import { clearLizardProjectCache, LizardClient } from "./client";
import { createLizardProvider } from "./provider";
import type { SandboxRecord, SandboxRunner } from "../types";

const ID = "genuine-toddler-jasj";

const record: SandboxRecord = {
  runtimeId: "runtime-1",
  apiKey: "liz_test_key_value",
  runnerToken: "avrt_token",
  sandboxId: ID,
  machineType: "default",
};

const connection: SandboxRunner = { call: async () => ({}) };

afterEach(() => clearLizardProjectCache());

function setup(options: {
  online?: boolean;
  sandboxRecord?: SandboxRecord;
  replies?: (url: string, method: string, body?: unknown) => Response | undefined;
  onExec?: () => void;
}) {
  const calls: string[] = [];
  const loads: (boolean | undefined)[] = [];
  let online = options.online ?? true;
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const path = url.replace("https://lizard.test", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push(`${method} ${path}`);

    if (method === "POST" && path.endsWith("/exec")) options.onExec?.();

    return (
      options.replies?.(path, method, body) ?? Response.json({ sandboxId: ID, status: "running" })
    );
  }) as typeof fetch;
  const provider = createLizardProvider({
    hub: { get: () => (online ? connection : undefined), disconnect: () => (online = false) },
    record: async ({ revoked }) => {
      loads.push(revoked);
      return options.sandboxRecord ?? record;
    },
    saveSandboxId: async () => undefined,
    apiKey: () => "liz_test_key_value",
    client: () => new LizardClient(fetchFn, "https://lizard.test"),
    runnerUrl: () => "https://aven.example.com/api",
    project: () => "proj_1",
    clock: { now: () => 0, sleep: async () => undefined },
  });
  return {
    provider,
    calls,
    loads,
    setOnline: (value: boolean) => {
      online = value;
    },
  };
}

describe("the lizard provider", () => {
  test("is the lizard kind and returns the runner that is already connected", async () => {
    const { provider, calls } = setup({});

    expect(provider.kind).toBe("lizard");
    expect(await provider.start({ runtimeId: "runtime-1", threadId: "t" })).toBe(connection);
    expect(calls).toEqual([`GET /api/sandboxes/${ID}`]);
  });

  test("starts a sandbox once for threads that ask together", async () => {
    const { provider, calls } = setup({});
    const [a, b] = await Promise.all([
      provider.start({ runtimeId: "runtime-1", threadId: "t1" }),
      provider.start({ runtimeId: "runtime-1", threadId: "t2" }),
    ]);

    expect(a).toBe(b);
    expect(calls).toEqual([`GET /api/sandboxes/${ID}`]);
  });

  test("resumes a paused sandbox, refreshes its timeout, and boots the runner", async () => {
    let state = "paused";
    const harness = setup({
      online: false,
      replies: (path, method) => {
        if (method === "GET" && path === `/api/sandboxes/${ID}`) {
          return Response.json({ sandboxId: ID, status: state });
        }

        if (method === "POST" && path === `/api/sandboxes/${ID}/resume`) {
          state = "running";
          return Response.json({ ok: true });
        }

        if (method === "POST" && path === `/api/sandboxes/${ID}/timeout`) {
          return Response.json({ ok: true });
        }

        if (method === "POST" && path === `/api/sandboxes/${ID}/files`) {
          return Response.json({ ok: true });
        }

        if (method === "POST" && path === `/api/sandboxes/${ID}/exec`) {
          return Response.json({ stdout: "", stderr: "", exitCode: 0 });
        }

        return undefined;
      },
      onExec: () => harness.setOnline(true),
    });

    const runner = await harness.provider.start({ runtimeId: "runtime-1", threadId: "t1" });

    expect(runner).toBe(connection);
    expect(harness.calls).toEqual([
      `GET /api/sandboxes/${ID}`,
      `POST /api/sandboxes/${ID}/resume`,
      `GET /api/sandboxes/${ID}`,
      `POST /api/sandboxes/${ID}/timeout`,
      `POST /api/sandboxes/${ID}/files`,
      `POST /api/sandboxes/${ID}/exec`,
    ]);
  });

  test("pauses a running sandbox on stop, including one whose runtime was revoked", async () => {
    const { provider, calls, loads } = setup({});

    await provider.stop("runtime-1");

    expect(loads).toEqual([true]);
    expect(calls).toEqual([`GET /api/sandboxes/${ID}`, `POST /api/sandboxes/${ID}/pause`]);
  });

  test("does not pause one that is already paused, and tolerates 404", async () => {
    const paused = setup({
      replies: () => Response.json({ sandboxId: ID, status: "paused" }),
    });
    await paused.provider.stop("runtime-1");
    expect(paused.calls).toEqual([`GET /api/sandboxes/${ID}`]);

    const gone = setup({
      replies: () => Response.json({ error: "not found" }, { status: 404 }),
    });
    const error = console.error;
    console.error = () => {};

    try {
      await gone.provider.stop("runtime-1");
    } finally {
      console.error = error;
    }
  });

  test("destroys a sandbox and treats 404 as destroyed", async () => {
    const { provider, calls } = setup({});
    await provider.destroy(ID);
    expect(calls).toEqual([`DELETE /api/sandboxes/${ID}`]);

    const gone = setup({
      replies: () => Response.json({ error: "gone" }, { status: 404 }),
    });
    await gone.provider.destroy(ID);

    const failing = setup({
      replies: () => Response.json({ error: "backend down" }, { status: 502 }),
    });
    await expect(failing.provider.destroy(ID)).rejects.toThrow("backend down");
  });

  test("cannot destroy anything without a key", async () => {
    const provider = createLizardProvider({
      hub: { get: () => undefined },
      record: async () => null,
      saveSandboxId: async () => undefined,
      apiKey: () => null,
    });

    await expect(provider.destroy(ID)).rejects.toBeInstanceOf(UnavailableError);
  });
});
