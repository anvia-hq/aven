import { afterAll, describe, expect, test } from "bun:test";

import { createCodingAgent } from "@aven/agents/coding-agent";

import { RunGateway } from "./gateway";

type Seen = { path: string; headers: Headers; body: Record<string, unknown> };

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
        headers: req.headers,
        body: (await req.json()) as Record<string, unknown>,
      });
      return reply();
    },
  });
  const origin = `http://localhost:${upstream.port}`;
  const gateway = new RunGateway({ anthropic: origin, openai: `${origin}/v1` });

  // Stands in for the control plane's route: /runtimes/gateway/:segment/*.
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
      modelId: "whatever-the-runtime-wants",
      apiKey: run.gatewayToken,
      baseUrl: `${base}${run.gatewayPath}`,
    });
    await agent.generate({ prompt: "hi" }).catch(() => undefined);

    const call = seen[before]!;
    expect(call.path).toBe("/openai/v1/responses");
    expect(call.headers.get("api-key")).toBe("azure-key");
    expect(call.headers.get("authorization")).toBe("Bearer azure-key");
    expect(call.body.model).toBe("my-deployment");
    gateway.revoke("r2a");
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

  test("a thread's token is the same for every run, and only works while a run holds it", async () => {
    const first = gateway.issue(
      "r-first",
      { provider: "anthropic", apiKey: "sk-real" },
      "thread-1",
    );
    const other = gateway.issue(
      "r-other",
      { provider: "anthropic", apiKey: "sk-real" },
      "thread-2",
    );
    expect(other.gatewayToken).not.toBe(first.gatewayToken);

    gateway.revoke("r-first");
    expect((await post("anthropic/v1/messages", first.gatewayToken, {})).status).toBe(401);

    // The run that answers the thread's question gets the token the paused run's client holds.
    const second = gateway.issue(
      "r-second",
      { provider: "anthropic", apiKey: "sk-real" },
      "thread-1",
    );
    expect(second.gatewayToken).toBe(first.gatewayToken);
    expect((await post("anthropic/v1/messages", second.gatewayToken, {})).status).not.toBe(401);
    gateway.revoke("r-second");
    gateway.revoke("r-other");
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
});
