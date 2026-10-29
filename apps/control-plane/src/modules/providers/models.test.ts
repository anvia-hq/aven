import { describe, expect, test } from "bun:test";

import { fetchModels, ModelListError } from "./service";

const respond = (body: unknown, init?: ResponseInit) =>
  (async () => Response.json(body, init)) as unknown as typeof fetch;

describe("fetchModels", () => {
  test("openai-compatible reads <baseUrl>/models, sorted and de-duplicated", async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string> };
      return Response.json({ data: [{ id: "b" }, { id: "a" }, { id: "a" }, { nope: 1 }] });
    }) as unknown as typeof fetch;
    const models = await fetchModels(
      { kind: "openai-compatible", baseUrl: "http://localhost:11434/v1/" },
      fetchFn,
    );
    expect(models).toEqual(["a", "b"]);
    expect(seen?.url).toBe("http://localhost:11434/v1/models");
    expect(seen?.headers.authorization).toBeUndefined();
  });

  test("anthropic sends x-api-key and the version header", async () => {
    let headers: Record<string, string> = {};
    const fetchFn = (async (_url: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>;
      return Response.json({ data: [{ id: "claude-x" }] });
    }) as unknown as typeof fetch;
    expect(await fetchModels({ kind: "anthropic", apiKey: "k" }, fetchFn)).toEqual(["claude-x"]);
    expect(headers["x-api-key"]).toBe("k");
    expect(headers["anthropic-version"]).toBeDefined();
  });

  test("maps failures to ModelListError", async () => {
    await expect(fetchModels({ kind: "openai" }, respond({}))).rejects.toBeInstanceOf(
      ModelListError,
    );
    await expect(
      fetchModels({ kind: "openai", apiKey: "k" }, respond({}, { status: 401 })),
    ).rejects.toThrow("401");
    await expect(
      fetchModels({ kind: "openai", apiKey: "k" }, respond({ nope: true })),
    ).rejects.toThrow("no model list");
    const down = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    await expect(
      fetchModels({ kind: "openai-compatible", baseUrl: "http://x/v1" }, down),
    ).rejects.toThrow("Could not reach");
  });
});
