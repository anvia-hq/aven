import { describe, expect, test } from "bun:test";

import { SpritesApiError, SpritesClient, execResultOf } from "./client";

type Call = {
  method: string;
  path: string;
  query: URLSearchParams;
  body: string;
  authorization: string | null;
};

function record(calls: Call[], input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(String(input));
  calls.push({
    method: init?.method ?? "GET",
    path: url.pathname,
    query: url.searchParams,
    body: init?.body ? String(init.body) : "",
    authorization: new Headers(init?.headers).get("Authorization"),
  });
}

const sprite = {
  id: "sprite-01234567-89ab-cdef-0123-456789abcdef",
  name: "aven-abc",
  organization: "anvia",
  url: "https://aven-abc-org.sprites.app",
  status: "cold",
  created_at: "2026-01-15T10:30:00Z",
  updated_at: "2026-01-15T10:30:00Z",
};

describe("SpritesClient", () => {
  test("creates a Sprite with a bearer token and keeps it private", async () => {
    const calls: Call[] = [];
    const client = new SpritesClient(
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        record(calls, input, init);
        return Response.json(sprite, { status: 201 });
      }) as typeof fetch,
      "https://api.sprites.test",
    );

    const created = await client.create("anvia/org-id/token-id/secret", "aven-abc");

    expect(created).toEqual({
      name: "aven-abc",
      id: sprite.id,
      status: "cold",
      url: "https://aven-abc-org.sprites.app",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/v1/sprites",
      authorization: "Bearer anvia/org-id/token-id/secret",
    });
    expect(JSON.parse(calls[0]!.body)).toEqual({
      name: "aven-abc",
      url_settings: { auth: "sprite" },
    });
  });

  test("reads a Sprite and reports a missing one as gone", async () => {
    const client = new SpritesClient(
      (async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = new URL(String(input));

        if (url.pathname === "/v1/sprites/aven-abc") return Response.json(sprite);

        return Response.json({ error: "sprite not found" }, { status: 404 });
      }) as typeof fetch,
      "https://api.sprites.test",
    );

    expect((await client.get("token", "aven-abc")).status).toBe("cold");

    const missing = client.get("token", "aven-gone").catch((error: unknown) => error);

    expect(await missing).toBeInstanceOf(SpritesApiError);
    expect((await missing) as SpritesApiError).toMatchObject({ status: 404 });
  });

  test("writes the boot file as bytes with its path, working directory and mode", async () => {
    const calls: Call[] = [];
    const client = new SpritesClient(
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        record(calls, input, init);
        return Response.json({
          path: "/home/sprite/.aven/runner-boot.env",
          size: 40,
          mode: "0600",
        });
      }) as typeof fetch,
      "https://api.sprites.test",
    );

    await client.writeFile(
      "token",
      "aven-abc",
      "/home/sprite/.aven/runner-boot.env",
      "AVEN_URL=x\n",
      {
        mode: "0600",
        workingDir: "/home/sprite",
      },
    );

    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.path).toBe("/v1/sprites/aven-abc/fs/write");
    expect(calls[0]!.query.get("path")).toBe("/home/sprite/.aven/runner-boot.env");
    expect(calls[0]!.query.get("workingDir")).toBe("/home/sprite");
    expect(calls[0]!.query.get("mode")).toBe("0600");
    expect(calls[0]!.query.get("mkdir")).toBe("true");
    expect(calls[0]!.body).toBe("AVEN_URL=x\n");
  });

  test("runs a command through bash with the repeated cmd query and reads its output", async () => {
    const calls: Call[] = [];
    const client = new SpritesClient(
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        record(calls, input, init);
        return Response.json({ stdout: "hello\n", stderr: "", exitCode: 0 });
      }) as typeof fetch,
      "https://api.sprites.test",
    );

    const result = await client.run("token", "aven-abc", "echo hello");

    expect(result).toEqual({ stdout: "hello\n", stderr: "", exitCode: 0 });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.path).toBe("/v1/sprites/aven-abc/exec");
    expect(calls[0]!.query.getAll("cmd")).toEqual(["bash", "-lc", "echo hello"]);
  });

  test("surfaces a rejected token without echoing it", async () => {
    const client = new SpritesClient(
      (async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ error: "invalid token" }, { status: 401 })) as typeof fetch,
      "https://api.sprites.test",
    );

    const failure = (await client
      .get("token", "aven-abc")
      .catch((error: unknown) => error)) as SpritesApiError;

    expect(failure).toBeInstanceOf(SpritesApiError);
    expect(failure.message).toBe("Sprites rejected this API token");
  });

  test("refuses a saved name that is not usable", async () => {
    const client = new SpritesClient(
      (async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json(sprite)) as typeof fetch,
      "https://api.sprites.test",
    );

    await expect(client.get("token", "../etc")).rejects.toThrow("not usable");
  });
});

describe("execResultOf", () => {
  test("reads the JSON a command answers with", () => {
    expect(execResultOf('{"stdout":"ok","stderr":"warn","exitCode":2}')).toEqual({
      stdout: "ok",
      stderr: "warn",
      exitCode: 2,
    });
  });

  test("reads the progress events a streamed answer carries", () => {
    const text = [
      '{"type":"info","data":"Fetching aven...","time":"2026-01-05T10:30:00Z"}',
      '{"type":"error","data":"no space left","time":"2026-01-05T10:30:01Z"}',
      '{"type":"complete","data":"done","time":"2026-01-05T10:30:02Z"}',
    ].join("\n");

    expect(execResultOf(text)).toEqual({
      stdout: "Fetching aven...\ndone\n",
      stderr: "no space left",
      exitCode: 0,
    });
  });

  test("keeps plain output as it came", () => {
    expect(execResultOf("hello\n")).toEqual({ stdout: "hello\n", stderr: "", exitCode: 0 });
  });
});
