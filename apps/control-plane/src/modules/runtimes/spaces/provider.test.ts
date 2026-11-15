import { describe, expect, test } from "bun:test";

import { UnavailableError } from "@aven/server-kit/errors";

import type { RuntimeConnection } from "../hub";
import { SpacesClient } from "./client";
import { createSpacesProvider } from "./provider";
import type { SpacesWakeRecord } from "./types";

const ID = "bx_23456789";

const record: SpacesWakeRecord = {
  runtimeId: "runtime-1",
  apiKey: "sk_test_key_value",
  runnerToken: "avrt_token",
  sandboxId: ID,
  machineType: "default",
};

const connection = { call: async () => ({}) } as unknown as RuntimeConnection;

function setup(options: { online?: boolean; replies?: (url: string, method: string) => Response }) {
  const calls: string[] = [];
  const loads: (boolean | undefined)[] = [];
  let online = options.online ?? true;
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.replace("https://spaces.test/api/v1", "")}`);

    return (
      options.replies?.(url, method) ??
      Response.json({ ok: true, sandbox: { id: ID, state: "ready" } })
    );
  }) as typeof fetch;
  const provider = createSpacesProvider({
    hub: { get: () => (online ? connection : undefined), disconnect: () => (online = false) },
    load: async (_runtimeId, revoked) => {
      loads.push(revoked);
      return record;
    },
    saveSandboxId: async () => undefined,
    apiKey: () => "sk_test_key_value",
    client: () => new SpacesClient("https://spaces.test/api/v1", fetchFn),
    runnerUrl: () => "https://aven.example.com/api",
  });
  return { provider, calls, loads };
}

describe("the spaces provider", () => {
  test("is the spaces kind and returns the runner that is already connected", async () => {
    const { provider, calls } = setup({});

    expect(provider.kind).toBe("spaces");
    expect(await provider.start({ runtimeId: "runtime-1", threadId: "t" })).toBe(connection);
    expect(calls).toEqual([`GET /sandboxes/${ID}`]);
  });

  test("starts a sandbox once for threads that ask together", async () => {
    const { provider, calls } = setup({});
    const [a, b] = await Promise.all([
      provider.start({ runtimeId: "runtime-1", threadId: "t1" }),
      provider.start({ runtimeId: "runtime-1", threadId: "t2" }),
    ]);

    expect(a).toBe(b);
    expect(calls).toEqual([`GET /sandboxes/${ID}`]);
  });

  test("lets the runner free a thread's sandbox, and does nothing when there is no runner", async () => {
    const { provider } = setup({});
    const asked: unknown[] = [];

    await provider.release({ runtimeId: "runtime-1", threadId: "t" }, {
      call: async (method: string, params: unknown) => asked.push([method, params]),
    } as never);
    await provider.release({ runtimeId: "runtime-1", threadId: "t" }, undefined);

    expect(asked).toEqual([["sandbox.release", { threadId: "t" }]]);
  });

  test("stops a sandbox that is running, including one whose runtime was revoked", async () => {
    const { provider, calls, loads } = setup({});

    await provider.stop("runtime-1");

    expect(loads).toEqual([true]);
    expect(calls).toEqual([`GET /sandboxes/${ID}`, `POST /sandboxes/${ID}/stop`]);
  });

  test("does not stop one that is already stopped, and does not fail when it is gone", async () => {
    const archived = setup({
      replies: () => Response.json({ ok: true, sandbox: { id: ID, state: "archived" } }),
    });
    await archived.provider.stop("runtime-1");
    expect(archived.calls).toEqual([`GET /sandboxes/${ID}`]);

    const gone = setup({
      replies: () => Response.json({ ok: false, code: "not_found", message: "" }, { status: 404 }),
    });
    const error = console.error;
    console.error = () => {};

    try {
      await gone.provider.stop("runtime-1");
    } finally {
      console.error = error;
    }
  });

  test("destroys a sandbox, and treats one that is already gone as destroyed", async () => {
    const { provider, calls } = setup({});
    await provider.destroy(ID);
    expect(calls).toEqual([`DELETE /sandboxes/${ID}`]);

    const gone = setup({
      replies: () => Response.json({ ok: false, code: "not_found", message: "" }, { status: 404 }),
    });
    await gone.provider.destroy(ID);

    const failing = setup({
      replies: () => Response.json({ ok: false, code: "x", message: "down" }, { status: 502 }),
    });
    await expect(failing.provider.destroy(ID)).rejects.toThrow("down");
  });

  test("cannot destroy anything without a key", async () => {
    const provider = createSpacesProvider({
      hub: { get: () => undefined },
      load: async () => null,
      saveSandboxId: async () => undefined,
      apiKey: () => null,
    });

    await expect(provider.destroy(ID)).rejects.toBeInstanceOf(UnavailableError);
  });
});
