import { describe, expect, test } from "bun:test";

import { BOAT_BOOT_COMMAND } from "./boot";
import { BoatApiError, BoatClient } from "./client";

const KEY = "boat_test_key_value";
const ID = "bx_23456789";

function recorded(reply: (url: string, init: RequestInit) => { status?: number; json: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const request = init ?? {};
    calls.push({ url, init: request });
    const next = reply(url, request);
    return new Response(JSON.stringify(next.json), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchFn };
}

const headers = (init: RequestInit) => init.headers as Record<string, string>;

const sandbox = (state: string) => ({
  ok: true,
  type: "sandbox.info",
  sandbox: { id: ID, state, dataExpiredAt: null },
});

describe("boat client", () => {
  test("checks the key with a bearer token that stays out of the url", async () => {
    const { calls, fetchFn } = recorded(() => ({
      json: { ok: true, type: "user.info", user: { login: "octocat" } },
    }));
    const client = new BoatClient(fetchFn, "https://boat.test/api/v1");

    await client.me(KEY);

    expect(calls[0]?.url).toBe("https://boat.test/api/v1/me");
    expect(calls[0]?.url).not.toContain(KEY);
    expect(headers(calls[0]!.init).Authorization).toBe(`Bearer ${KEY}`);
  });

  test("says when the key is rejected", async () => {
    const { fetchFn } = recorded(() => ({
      status: 401,
      json: {
        ok: false,
        type: "sandbox.error",
        status: 401,
        code: "unauthorized",
        message: "Unauthorized",
        error: { code: "unauthorized", message: "Unauthorized", status: 401 },
      },
    }));
    const client = new BoatClient(fetchFn, "https://boat.test/api/v1");

    await expect(client.me(KEY)).rejects.toEqual(
      new BoatApiError(401, "unauthorized", "Boat rejected this API key"),
    );
  });

  test("creates a private sandbox and retries a trial that cannot disable auto-stop", async () => {
    const bodies: unknown[] = [];
    const keys: string[] = [];
    const { fetchFn } = recorded((_url, init) => {
      bodies.push(JSON.parse(String(init.body)));
      keys.push(headers(init)["Idempotency-Key"] ?? "");

      if (bodies.length === 1)
        return {
          status: 400,
          json: {
            ok: false,
            code: "trial_auto_stop_required",
            message: "A trial sandbox has to stop itself",
            error: {
              code: "trial_auto_stop_required",
              message: "A trial sandbox has to stop itself",
              status: 400,
            },
          },
        };

      return { status: 202, json: sandbox("provisioning") };
    });
    const client = new BoatClient(fetchFn, "https://boat.test/api/v1");
    const created = await client.createSandbox(KEY, {
      runtimeId: "11111111-1111-4111-8111-111111111111",
      machineType: "small",
    });

    expect(created).toEqual({ id: ID, state: "provisioning", dataExpiredAt: null });
    expect(bodies[0]).toMatchObject({
      type: "small",
      ttlSeconds: null,
      noEnv: true,
      visibility: "private",
      labels: { avenRuntimeId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(bodies[1]).toMatchObject({ ttlSeconds: 7200 });
    expect(keys).toEqual([
      "aven-11111111-1111-4111-8111-111111111111",
      "aven-11111111-1111-4111-8111-111111111111-trial",
    ]);
  });

  test("refuses a sandbox id that is not one boat would issue", async () => {
    const { fetchFn } = recorded(() => ({
      json: { ok: true, type: "sandbox.info", sandbox: { id: "bx_00000000", state: "ready" } },
    }));
    const client = new BoatClient(fetchFn, "https://boat.test/api/v1");

    await expect(client.getSandbox(KEY, "bx_23456789")).rejects.toBeInstanceOf(BoatApiError);
  });

  test("starts a command without a body on stop, and writes a file", async () => {
    const { calls, fetchFn } = recorded((url) => {
      if (url.endsWith("/commands"))
        return {
          json: {
            ok: true,
            type: "command.started",
            success: true,
            processId: 4,
            pid: 4,
            command: BOAT_BOOT_COMMAND,
            startedAt: "2026-01-01T00:00:00Z",
          },
        };

      return {
        json: {
          ok: true,
          type: "file.written",
          success: true,
          path: "/home/user/a",
          encoding: "utf8",
          size: 1,
        },
      };
    });
    const client = new BoatClient(fetchFn, "https://boat.test/api/v1");

    await client.writeFile(
      KEY,
      ID,
      "/home/user/.aven/boat-runner.env",
      "AVEN_RUNTIME_TOKEN=avrt_secret",
    );
    await client.command(KEY, ID, BOAT_BOOT_COMMAND, true);
    await client.stop(KEY, ID);

    const write = calls[0]!;
    expect(write.init.method).toBe("PUT");
    expect(JSON.parse(String(write.init.body))).toEqual({
      path: "/home/user/.aven/boat-runner.env",
      content: "AVEN_RUNTIME_TOKEN=avrt_secret",
      encoding: "utf8",
    });
    const command = JSON.parse(String(calls[1]?.init.body));
    expect(command).toEqual({ command: BOAT_BOOT_COMMAND, detached: true });
    expect(command.command).not.toContain("avrt_secret");
    expect(calls[2]?.init.method).toBe("POST");
    expect(calls[2]?.url).toBe(`https://boat.test/api/v1/sandboxes/${ID}/stop`);
    expect(calls[2]?.init.body).toBeUndefined();
  });

  test("reports a sandbox that cannot be reached", async () => {
    const fetchFn = (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new BoatClient(fetchFn, "https://boat.test/api/v1");

    await expect(client.me(KEY)).rejects.toEqual(
      new BoatApiError(0, "network", "Could not reach boat.dev"),
    );
  });
});
