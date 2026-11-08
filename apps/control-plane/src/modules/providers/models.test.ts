import { afterAll, describe, expect, test } from "bun:test";

import { effortsByModel, effortsFor, fetchModels, ModelListError } from "./model-list";

const allowedBefore = process.env.PROVIDER_ALLOWED_HOSTS;
process.env.PROVIDER_ALLOWED_HOSTS = "localhost";
afterAll(() => {
  if (allowedBefore === undefined) delete process.env.PROVIDER_ALLOWED_HOSTS;
  else process.env.PROVIDER_ALLOWED_HOSTS = allowedBefore;
});

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

  test("gemini reads Google's list with its key header, keeping models that can generate", async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string> };
      return Response.json({
        models: [
          { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        ],
      });
    }) as unknown as typeof fetch;
    expect(await fetchModels({ kind: "gemini", apiKey: "g-key" }, fetchFn)).toEqual([
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ]);
    expect(seen?.url).toStartWith("https://generativelanguage.googleapis.com/v1beta/models");
    expect(seen?.headers["x-goog-api-key"]).toBe("g-key");
    await expect(fetchModels({ kind: "gemini" }, fetchFn)).rejects.toThrow("API key");
  });

  test("bedrock reads <endpoint>/models with its key as a bearer token, and only from AWS", async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string> };
      return Response.json({ data: [{ id: "openai.gpt-oss-120b" }, { id: "amazon.nova-pro" }] });
    }) as unknown as typeof fetch;
    const baseUrl = "https://bedrock-mantle.us-west-2.api.aws/v1";
    expect(await fetchModels({ kind: "bedrock", apiKey: "b-key", baseUrl }, fetchFn)).toEqual([
      "amazon.nova-pro",
      "openai.gpt-oss-120b",
    ]);
    expect(seen?.url).toBe(`${baseUrl}/models`);
    expect(seen?.headers.authorization).toBe("Bearer b-key");
    await expect(fetchModels({ kind: "bedrock", baseUrl }, fetchFn)).rejects.toThrow("API key");
    await expect(fetchModels({ kind: "bedrock", apiKey: "k" }, fetchFn)).rejects.toThrow("region");
    await expect(
      fetchModels(
        { kind: "bedrock", apiKey: "k", baseUrl: "https://evil.example.com/v1" },
        fetchFn,
      ),
    ).rejects.toThrow("Not a Bedrock endpoint");
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
      fetchModels({ kind: "openai-compatible", baseUrl: "http://localhost:1/v1" }, down),
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
  const source = {
    kind: "openai-compatible",
    baseUrl: `http://localhost:${gateway.port}/v1`,
    apiKey: "gw-key",
  } as const;

  test("are the levels the gateway lists, for the models that take an effort", async () => {
    expect(await effortsByModel(source, ["muse", "plain", "unlisted"])).toEqual({
      muse: { options: levels, defaultValue: null },
    });
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
