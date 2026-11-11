import { afterAll, describe, expect, test } from "bun:test";

import { createCodingAgent } from "@aven/agents/coding-agent";

import { GoogleAuthError } from "../providers/google-auth";
import { RunGateway, gatewayUpstreams } from "./gateway";

const allowedBefore = process.env.PROVIDER_ALLOWED_HOSTS;
process.env.PROVIDER_ALLOWED_HOSTS = "localhost";
afterAll(() => {
  if (allowedBefore === undefined) delete process.env.PROVIDER_ALLOWED_HOSTS;
  else process.env.PROVIDER_ALLOWED_HOSTS = allowedBefore;
});

type Seen = { path: string; search: string; headers: Headers; body: Record<string, unknown> };

describe("RunGateway", () => {
  const seen: Seen[] = [];
  let reply = () =>
    Response.json(
      { type: "error", error: { type: "invalid_request_error", message: "stop" } },
      {
        status: 400,
      },
    );
  const upstream = Bun.serve({
    port: 0,
    async fetch(req) {
      seen.push({
        path: new URL(req.url).pathname,
        search: new URL(req.url).search,
        headers: req.headers,
        body: (await req.json()) as Record<string, unknown>,
      });
      return reply();
    },
  });
  const origin = `http://localhost:${upstream.port}`;
  const gateway = new RunGateway({ anthropic: origin, openai: `${origin}/v1`, gemini: origin });

  const front = Bun.serve({
    port: 0,
    fetch(req) {
      const [, , , segment, ...rest] = new URL(req.url).pathname.split("/");
      return gateway.forward(req, segment!, rest.join("/"));
    },
  });
  const base = `http://localhost:${front.port}`;
  afterAll(() => {
    upstream.stop(true);
    front.stop(true);
  });

  const post = (path: string, token: string | null, body: unknown, key = "authorization") => {
    const headers = new Headers();
    if (token) headers.set(key, key === "authorization" ? `Bearer ${token}` : token);
    return fetch(`${base}/runtimes/gateway/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  };

  test("anthropic: the SDK reaches /v1/messages with the sender's key, model and effort", async () => {
    const run = gateway.issue("r1", {
      provider: "anthropic",
      modelId: "claude-sonnet-5",
      apiKey: "sk-real",
      reasoningEffort: "low",
    });
    const before = seen.length;
    const { agent } = createCodingAgent({
      tools: [],
      provider: "anthropic",
      modelId: "whatever-the-runtime-wants",
      apiKey: run.gatewayToken,
      baseUrl: `${base}${run.gatewayPath}`,
      reasoningEffort: "high",
      effortLevels: ["low", "high"],
    });
    await agent
      .generate({ prompt: "hi", controls: { reasoningEffort: "high" } as never })
      .catch(() => undefined);

    const call = seen[before]!;
    expect(call.path).toBe("/v1/messages");
    expect(call.headers.get("x-api-key")).toBe("sk-real");
    expect(call.body.model).toBe("claude-sonnet-5");
    expect(call.body.output_config).toEqual({ effort: "low" });
    gateway.revoke("r1");
  });

  test("openai: the Responses API gets the pinned model and effort", async () => {
    const run = gateway.issue("r2", {
      provider: "openai",
      modelId: "o3",
      apiKey: "sk-openai",
      reasoningEffort: "medium",
    });
    const before = seen.length;
    const { agent } = createCodingAgent({
      tools: [],
      provider: "openai",
      modelId: "gpt-5.6",
      apiKey: run.gatewayToken,
      baseUrl: `${base}${run.gatewayPath}`,
    });
    await agent.generate({ prompt: "hi" }).catch(() => undefined);

    const call = seen[before]!;
    expect(call.path).toBe("/v1/responses");
    expect(call.headers.get("authorization")).toBe("Bearer sk-openai");
    expect(call.body.model).toBe("o3");
    expect(call.body.reasoning).toMatchObject({ effort: "medium" });
    gateway.revoke("r2");
  });

  test("azure: the SDK reaches the resource's v1 API with the sender's key and deployment", async () => {
    for (const [runtimeModel, path] of [
      ["gpt-5.5", "/openai/v1/responses"],
      ["DeepSeek-V4.1-Flash", "/openai/v1/chat/completions"],
    ] as const) {
      const run = gateway.issue("r2a", {
        provider: "azure",
        modelId: "my-deployment",
        baseUrl: origin,
        apiKey: "azure-key",
      });
      expect(run.gatewayPath).toBe("/runtimes/gateway/azure");
      const before = seen.length;
      const { agent } = createCodingAgent({
        tools: [],
        provider: "azure",
        modelId: runtimeModel,
        apiKey: run.gatewayToken,
        baseUrl: `${base}${run.gatewayPath}`,
      });
      await agent.generate({ prompt: "hi" }).catch(() => undefined);

      const call = seen[before]!;
      expect(call.path).toBe(path);
      expect(call.headers.get("api-key")).toBe("azure-key");
      expect(call.headers.get("authorization")).toBe("Bearer azure-key");
      expect(call.body.model).toBe("my-deployment");
      gateway.revoke("r2a");
    }
  });

  test("gemini: the SDK reaches the sender's model with the sender's key, whatever it names", async () => {
    const run = gateway.issue("r2g", {
      provider: "gemini",
      modelId: "gemini-2.5-flash",
      apiKey: "gemini-key",
    });
    expect(run.gatewayPath).toBe("/runtimes/gateway/gemini");
    const before = seen.length;
    const { agent } = createCodingAgent({
      tools: [],
      provider: "gemini",
      modelId: "gemini-2.5-pro",
      apiKey: run.gatewayToken,
      baseUrl: `${base}${run.gatewayPath}`,
    });
    await agent.generate({ prompt: "hi" }).catch(() => undefined);

    const call = seen[before]!;
    expect(call.path).toBe("/v1beta/models/gemini-2.5-flash:generateContent");
    expect(call.headers.get("x-goog-api-key")).toBe("gemini-key");
    expect(call.headers.get("authorization")).toBeNull();
    expect(call.body.model).toBeUndefined();
    gateway.revoke("r2g");
  });

  test("gemini: only the generate calls pass, on the sender's model", async () => {
    const run = gateway.issue("r2h", { provider: "gemini", modelId: "pinned", apiKey: "k" });
    const send = (path: string) => post(`gemini/${path}`, run.gatewayToken, { contents: [] });
    expect((await send("v1beta/models")).status).toBe(404);
    expect((await send("v1beta/models/x:embedContent")).status).toBe(404);
    expect((await send("v1beta/files")).status).toBe(404);
    const before = seen.length;
    await send("v1beta/models/expensive:streamGenerateContent?alt=sse");
    expect(seen[before]!.path).toBe("/v1beta/models/pinned:streamGenerateContent");
    expect(seen[before]!.search).toBe("?alt=sse");
    gateway.revoke("r2h");
  });

  test("bedrock: chat completions go to the stored regional endpoint with the sender's key and model", async () => {
    const run = gateway.issue("r2i", {
      provider: "bedrock",
      modelId: "openai.gpt-oss-120b",
      baseUrl: `${origin}/v1`,
      apiKey: "bedrock-key",
    });
    expect(run.gatewayPath).toBe("/runtimes/gateway/bedrock");
    const before = seen.length;
    const { agent } = createCodingAgent({
      tools: [],
      provider: "bedrock",
      modelId: "something-expensive",
      apiKey: run.gatewayToken,
      baseUrl: `${base}${run.gatewayPath}`,
    });
    await agent.generate({ prompt: "hi" }).catch(() => undefined);
    const call = seen[before]!;
    expect(call.path).toBe("/v1/chat/completions");
    expect(call.headers.get("authorization")).toBe("Bearer bedrock-key");
    expect(call.body.model).toBe("openai.gpt-oss-120b");
    const refused = await post("bedrock/responses", run.gatewayToken, {});
    expect(refused.status).toBe(404);
    gateway.revoke("r2i");
    expect(() => gateway.issue("r2j", { provider: "bedrock", modelId: "m" })).toThrow("no API key");
  });

  test("vertex: chat completions go to the project's endpoint with a token made from the credential", async () => {
    const minted: string[] = [];
    const vertex = new RunGateway({ anthropic: origin, openai: origin }, async (credential) => {
      minted.push(credential);
      return `token-for-${credential}`;
    });
    const front2 = Bun.serve({
      port: 0,
      fetch(req) {
        const [, , , segment, ...rest] = new URL(req.url).pathname.split("/");
        return vertex.forward(req, segment!, rest.join("/"));
      },
    });
    try {
      const run = vertex.issue("r2k", {
        provider: "vertex",
        modelId: "google/gemini-2.5-flash",
        baseUrl: `${origin}/v1/projects/p/locations/global/endpoints/openapi`,
        apiKey: "the-credential",
      });
      expect(run.gatewayPath).toBe("/runtimes/gateway/vertex");
      const before = seen.length;
      const { agent } = createCodingAgent({
        tools: [],
        provider: "vertex",
        modelId: "something-expensive",
        apiKey: run.gatewayToken,
        baseUrl: `http://localhost:${front2.port}${run.gatewayPath}`,
      });
      await agent.generate({ prompt: "hi" }).catch(() => undefined);
      const call = seen[before]!;
      expect(call.path).toBe("/v1/projects/p/locations/global/endpoints/openapi/chat/completions");
      expect(call.headers.get("authorization")).toBe("Bearer token-for-the-credential");
      expect(call.body.model).toBe("google/gemini-2.5-flash");
      expect(minted).toEqual(["the-credential"]);
      expect(() => vertex.issue("r2l", { provider: "vertex", modelId: "m" })).toThrow(
        "no credential",
      );

      const failing = new RunGateway({ anthropic: origin, openai: origin }, async () => {
        throw new GoogleAuthError("Google refused the service account key (400)");
      });
      const token = failing.issue("r2m", {
        provider: "vertex",
        modelId: "m",
        baseUrl: origin,
        apiKey: "bad",
      }).gatewayToken;
      const count = seen.length;
      const refused = await failing.forward(
        new Request("http://x/runtimes/gateway/vertex/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: "{}",
        }),
        "vertex",
        "chat/completions",
      );
      expect(refused.status).toBe(502);
      expect(await refused.json()).toEqual({
        error: "Google refused the service account key (400)",
      });
      expect(seen).toHaveLength(count);
    } finally {
      front2.stop(true);
    }
  });

  test("an Azure provider without a key cannot start a run", () => {
    expect(() =>
      gateway.issue("r2b", { provider: "azure", modelId: "d", baseUrl: origin }),
    ).toThrow("no API key");
  });

  test("a runtime cannot choose its own model or effort, or smuggle its own key", async () => {
    const run = gateway.issue("r3", {
      provider: "anthropic",
      modelId: "pinned",
      apiKey: "sk-real",
    });
    const before = seen.length;
    await post(
      "anthropic/v1/messages",
      run.gatewayToken,
      {
        model: "expensive",
        output_config: { effort: "max", format: "x" },
      },
      "x-api-key",
    );
    const call = seen[before]!;
    expect(call.body.model).toBe("pinned");
    expect((call.body.output_config as Record<string, unknown>).effort).toBeUndefined();
    expect(call.headers.get("x-api-key")).toBe("sk-real");
    expect(JSON.stringify([...call.headers])).not.toContain(run.gatewayToken);
    gateway.revoke("r3");
  });

  test("unknown, revoked, mismatched and off-list requests are refused", async () => {
    const run = gateway.issue("r4", { provider: "anthropic", apiKey: "sk-real" });
    const before = seen.length;
    expect((await post("anthropic/v1/messages", "avgw_nope", {})).status).toBe(401);
    expect((await post("anthropic/v1/messages", null, {})).status).toBe(401);
    expect((await post("openai/responses", run.gatewayToken, {})).status).toBe(403);
    expect((await post("anthropic/v1/models", run.gatewayToken, {})).status).toBe(404);
    expect((await post("anthropic/v1/messages/batches", run.gatewayToken, {})).status).toBe(404);
    const get = await fetch(`${base}/runtimes/gateway/anthropic/v1/messages`, {
      headers: { authorization: `Bearer ${run.gatewayToken}` },
    });
    expect(get.status).toBe(404);
    expect(seen.length).toBe(before);

    gateway.revoke("r4");
    expect((await post("anthropic/v1/messages", run.gatewayToken, {})).status).toBe(401);
  });

  test("every run gets a token of its own, even on the same thread", () => {
    const first = gateway.issue(
      "r-first",
      { provider: "anthropic", apiKey: "sk-real" },
      "thread-1",
    );
    const second = gateway.issue(
      "r-second",
      { provider: "anthropic", apiKey: "sk-real" },
      "thread-1",
    );
    const other = gateway.issue(
      "r-other",
      { provider: "anthropic", apiKey: "sk-real" },
      "thread-2",
    );
    expect(new Set([first.gatewayToken, second.gatewayToken, other.gatewayToken]).size).toBe(3);
    gateway.revoke("r-first");
    gateway.revoke("r-second");
    gateway.revoke("r-other");
  });

  test("revoking a run takes away that run's token only", async () => {
    const first = gateway.issue("r-a", { provider: "anthropic", apiKey: "sk-real" }, "thread-3");
    const second = gateway.issue("r-b", { provider: "anthropic", apiKey: "sk-real" }, "thread-3");
    expect((await post("anthropic/v1/messages", first.gatewayToken, {})).status).not.toBe(401);
    expect((await post("anthropic/v1/messages", second.gatewayToken, {})).status).not.toBe(401);

    gateway.revoke("r-a");
    expect((await post("anthropic/v1/messages", first.gatewayToken, {})).status).toBe(401);
    expect((await post("anthropic/v1/messages", second.gatewayToken, {})).status).not.toBe(401);

    gateway.revoke("r-b");
    expect((await post("anthropic/v1/messages", second.gatewayToken, {})).status).toBe(401);
  });

  test("a run that answers a question can use the token of the run that asked", async () => {
    const asking = gateway.issue(
      "r-asks",
      { provider: "anthropic", apiKey: "sk-real" },
      "thread-q",
    );
    gateway.revoke("r-asks");
    expect((await post("anthropic/v1/messages", asking.gatewayToken, {})).status).toBe(401);

    const answering = gateway.issue(
      "r-answers",
      { provider: "anthropic", apiKey: "sk-real" },
      "thread-q",
      "r-asks",
    );
    expect(answering.gatewayToken).toBe(asking.gatewayToken);
    expect((await post("anthropic/v1/messages", asking.gatewayToken, {})).status).not.toBe(401);

    gateway.revoke("r-asks");
    expect((await post("anthropic/v1/messages", asking.gatewayToken, {})).status).not.toBe(401);

    gateway.revoke("r-answers");
    expect((await post("anthropic/v1/messages", asking.gatewayToken, {})).status).toBe(401);
  });

  test("the vendor's streamed answer passes through untouched", async () => {
    const run = gateway.issue("r5", { provider: "anthropic", apiKey: "sk-real" });
    const chunks = ["event: a\ndata: 1\n\n", "event: b\ndata: 2\n\n"];
    reply = () =>
      new Response(
        new ReadableStream({
          async start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(new TextEncoder().encode(chunk));
              await Bun.sleep(20);
            }
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    const response = await post("anthropic/v1/messages", run.gatewayToken, { stream: true });
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await response.text()).toBe(chunks.join(""));
    gateway.revoke("r5");
  });

  test("a model can be checked for a key without a grant being made", () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => gateway.check({ provider: "anthropic" })).toThrow(
        "ANTHROPIC_API_KEY is not set",
      );
      expect(() => gateway.check({ provider: "anthropic", apiKey: "k" })).not.toThrow();
      expect(() => gateway.check({ provider: "azure" })).toThrow("no API key");
      expect(() => gateway.check({ provider: "gemini" })).toThrow("GEMINI_API_KEY is not set");
      expect(() => gateway.check({ provider: "openai-compatible" })).not.toThrow();
    } finally {
      if (saved) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  test("a missing key fails when the grant is issued, not mid-run", () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => gateway.issue("r6", { provider: "anthropic" })).toThrow(
        "ANTHROPIC_API_KEY is not set",
      );
    } finally {
      if (saved) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  test("an upstream that cannot be reached is a 502, and is logged with the model but no secret", async () => {
    const down = new RunGateway({
      anthropic: "http://127.0.0.1:1",
      openai: "http://127.0.0.1:1/v1",
    });
    const run = down.issue("r-down", {
      provider: "openai",
      modelId: "some-model",
      apiKey: "sk-secret-key",
    });
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => void warned.push(args.join(" "));
    try {
      const response = await down.forward(
        new Request("http://gateway.test/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${run.gatewayToken}` },
          body: JSON.stringify({ messages: [] }),
        }),
        "openai",
        "chat/completions",
      );
      expect(response.status).toBe(502);
    } finally {
      console.warn = warn;
    }
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain("openai model some-model");
    expect(warned[0]).not.toContain("sk-secret-key");
  });

  test("with no token secret the gateway cannot start, and says which one to set", async () => {
    const encryptionKey = process.env.PROVIDER_ENCRYPTION_KEY;
    const authSecret = process.env.BETTER_AUTH_SECRET;
    delete process.env.PROVIDER_ENCRYPTION_KEY;
    delete process.env.BETTER_AUTH_SECRET;
    try {
      await expect(import(`./gateway.ts?no-secret=${crypto.randomUUID()}`)).rejects.toThrow(
        "The model gateway has no token secret: set PROVIDER_ENCRYPTION_KEY or BETTER_AUTH_SECRET",
      );
    } finally {
      if (encryptionKey !== undefined) process.env.PROVIDER_ENCRYPTION_KEY = encryptionKey;
      if (authSecret !== undefined) process.env.BETTER_AUTH_SECRET = authSecret;
    }
  });
});

describe("gatewayUpstreams", () => {
  test("Anthropic stays on its own API unless AVEN_ANTHROPIC_BASE_URL names another", () => {
    expect(gatewayUpstreams({}).anthropic).toBe("https://api.anthropic.com");
    expect(gatewayUpstreams({ AVEN_ANTHROPIC_BASE_URL: "  " }).anthropic).toBe(
      "https://api.anthropic.com",
    );
    expect(gatewayUpstreams({ AVEN_ANTHROPIC_BASE_URL: "http://127.0.0.1:9" }).anthropic).toBe(
      "http://127.0.0.1:9",
    );
    expect(gatewayUpstreams({ AVEN_ANTHROPIC_BASE_URL: "http://127.0.0.1:9" }).openai).toBe(
      "https://api.openai.com/v1",
    );
  });
});
