import { describe, expect, test } from "bun:test";

import { SpacesApiError, SpacesClient } from "./client";

const KEY = "sk_test_key_value";
const ID = "bx_23456789";
const BASE = "https://spaces.test/api/v1";

function recorded(reply: (url: string, init: RequestInit) => Response) {
  const calls: { method: string; url: string; headers: Record<string, string>; body?: unknown }[] =
    [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      url: String(input),
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return reply(String(input), init ?? {});
  }) as typeof fetch;
  return { calls, client: new SpacesClient(BASE, fetchFn) };
}

const ok = (sandbox: object = { id: ID, state: "ready" }) =>
  Response.json({ ok: true, type: "sandbox.info", sandbox });

describe("the spaces client", () => {
  test("creates a sandbox with only the fields spaces takes, idempotently", async () => {
    const { calls, client } = recorded(() => ok({ id: ID, state: "provisioning" }));

    expect(await client.createSandbox(KEY, { runtimeId: "r-1", machineType: "default" })).toEqual({
      id: ID,
      state: "provisioning",
    });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${BASE}/sandboxes`);
    expect(Object.keys(calls[0]?.body as object).sort()).toEqual([
      "labels",
      "name",
      "ttlSeconds",
      "type",
    ]);
    expect(calls[0]?.body).toMatchObject({ type: "default", labels: { avenRuntimeId: "r-1" } });
    expect(calls[0]?.headers["Idempotency-Key"]).toBe("aven-r-1");
    expect(calls[0]?.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  test("resumes and stops with an empty body, and deletes without a confirmation header", async () => {
    const { calls, client } = recorded(() => Response.json({ ok: true }));

    await client.resume(KEY, ID);
    await client.stop(KEY, ID);
    await client.deleteSandbox(KEY, ID);

    expect(calls.map((call) => `${call.method} ${call.url.replace(BASE, "")}`)).toEqual([
      `POST /sandboxes/${ID}/resume`,
      `POST /sandboxes/${ID}/stop`,
      `DELETE /sandboxes/${ID}`,
    ]);
    expect(calls[0]?.body).toEqual({});
    expect(calls[2]?.headers["X-Ascii-Confirm-Delete"]).toBeUndefined();
  });

  test("runs a command with its timeout, and reports one that fails", async () => {
    const { calls, client } = recorded(() => Response.json({ ok: true, type: "ok" }));
    await client.command(KEY, ID, "echo hi", { detached: true, timeoutSeconds: 600 });
    expect(calls[0]?.body).toEqual({ command: "echo hi", detached: true, timeoutSeconds: 600 });

    const failing = recorded(() =>
      Response.json({ ok: true, type: "command.finished", exitCode: 2, stderr: "no such file" }),
    );
    await expect(failing.client.command(KEY, ID, "cat x")).rejects.toEqual(
      new SpacesApiError(200, "command_failed", "no such file"),
    );
  });

  test("refuses an id that spaces would not have made", async () => {
    const { client } = recorded(() => ok({ id: "not-an-id", state: "ready" }));

    await expect(client.getSandbox(KEY, ID)).rejects.toEqual(
      new SpacesApiError(0, "invalid_sandbox_id", "Spaces returned an unexpected sandbox id"),
    );
    await expect(client.getSandbox(KEY, "../etc")).rejects.toEqual(
      new SpacesApiError(0, "invalid_sandbox_id", "The saved spaces sandbox id is not usable"),
    );
  });

  test("speaks of spaces when it fails, and keeps keys out of what it says", async () => {
    const failure = (status: number, message: string) =>
      recorded(() =>
        Response.json({ ok: false, code: "x", message, error: { code: "x", message } }, { status }),
      ).client;

    await expect(failure(401, "").getSandbox(KEY, ID)).rejects.toEqual(
      new SpacesApiError(401, "x", "Spaces rejected this API key"),
    );
    await expect(failure(404, "").getSandbox(KEY, ID)).rejects.toEqual(
      new SpacesApiError(404, "x", "The spaces sandbox is gone"),
    );
    await expect(failure(500, `bad key ${KEY}`).getSandbox(KEY, ID)).rejects.toEqual(
      new SpacesApiError(500, "x", "bad key sk_…"),
    );

    const down = new SpacesClient(BASE, (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    await expect(down.getSandbox(KEY, ID)).rejects.toEqual(
      new SpacesApiError(0, "network", "Could not reach the spaces server"),
    );
  });

  test("a reply that is not the envelope is a failure", async () => {
    const html = recorded(() => new Response("<html>", { status: 200 })).client;
    await expect(html.getSandbox(KEY, ID)).rejects.toMatchObject({ code: "invalid_json" });

    const bare = recorded(() => Response.json({ sandbox: { id: ID, state: "ready" } })).client;
    await expect(bare.getSandbox(KEY, ID)).rejects.toBeInstanceOf(SpacesApiError);
  });
});
