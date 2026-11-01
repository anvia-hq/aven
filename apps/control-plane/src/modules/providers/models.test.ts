import { afterAll, describe, expect, test } from "bun:test";

import { effortsByModel, effortsFor, fetchModels, ModelListError } from "./model-list";

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

describe("the efforts of a gateway's models", () => {
  const levels = ["minimal", "low", "medium", "high", "xhigh", "max"];
  const asked: (string | null)[] = [];
  const gateway = Bun.serve({
    port: 0,
    fetch(req) {
      asked.push(req.headers.get("authorization"));
      return Response.json({
        data: [
          {
            model_name: "muse",
            model_info: { supports_reasoning_effort: true, reasoning_effort_levels: levels },
          },
          { model_name: "plain", model_info: { max_input_tokens: 8000 } },
        ],
      });
    },
  });
  afterAll(() => gateway.stop(true));
  // A port of its own per test run, so no other test's answer is cached for it.
  const source = {
    kind: "openai-compatible",
    baseUrl: `http://localhost:${gateway.port}/v1`,
    apiKey: "gw-key",
  } as const;

  test("are the levels the gateway lists, for the models that take an effort", async () => {
    expect(await effortsByModel(source, ["muse", "plain", "unlisted"])).toEqual({
      muse: { options: levels, defaultValue: null },
    });
    // One request answered for every model, with the provider's own key.
    expect(asked).toEqual(["Bearer gw-key"]);
  });

  test("come with the levels the model must be built with", async () => {
    expect((await effortsFor(source, "muse")).effortLevels).toEqual(levels);
    expect((await effortsFor(source, "plain")).controls).toBeNull();
  });

  test("are none for a server with no address to ask", async () => {
    expect(await effortsByModel({ kind: "openai-compatible" }, ["muse"])).toEqual({});
  });
});
