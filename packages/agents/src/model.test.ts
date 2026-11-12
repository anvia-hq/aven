import { afterAll, describe, expect, test } from "bun:test";
import { Agent, defineCompletionModelControls } from "@anvia/core";
import { AnthropicClient } from "@anvia/anthropic";

import { createCodingAgent } from "./coding-agent";
import { azureApiFor, createModel, providerOptionsFor, reasoningControlsFor } from "./model";
import type { ModelConfig } from "./types";

describe("providerOptionsFor", () => {
  test("only anthropic gets automatic prompt caching", () => {
    expect(providerOptionsFor("anthropic")).toEqual({ cache_control: { type: "ephemeral" } });
    expect(providerOptionsFor("openai")).toBeUndefined();
    expect(providerOptionsFor("openai-compatible")).toBeUndefined();
    expect(providerOptionsFor("azure")).toBeUndefined();
    expect(providerOptionsFor("gemini")).toBeUndefined();
    expect(providerOptionsFor("bedrock")).toBeUndefined();
    expect(providerOptionsFor("vertex")).toBeUndefined();
  });
});

describe("createModel bedrock", () => {
  const bedrock = {
    provider: "bedrock",
    baseUrl: "https://bedrock-mantle.us-east-1.api.aws/v1",
  } as const;

  test("needs an endpoint, a model and a key", () => {
    expect(() => createModel({ provider: "bedrock", modelId: "m" }, "k")).toThrow(
      "regional endpoint",
    );
    expect(() => createModel(bedrock, "k")).toThrow("model id");
    expect(() => createModel({ ...bedrock, modelId: "m" }, undefined)).toThrow("API key");
    expect(createModel({ ...bedrock, modelId: "m" }, "k").modelId).toBe("m");
  });

  test("offers an effort control only from levels the host supplies", () => {
    const config = { ...bedrock, modelId: "openai.gpt-oss-120b" };
    expect(reasoningControlsFor(config)).toBeNull();
    expect(reasoningControlsFor({ ...config, effortLevels: ["low", "high"] })?.options).toEqual([
      "low",
      "high",
    ]);
  });

  test("sends chat completions to the endpoint with the key as a bearer token", async () => {
    const seen: { path: string; auth: string | null }[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        seen.push({ path: new URL(req.url).pathname, auth: req.headers.get("authorization") });
        return Response.json({ error: { message: "stop" } }, { status: 400 });
      },
    });
    try {
      const { agent } = createCodingAgent({
        tools: [],
        ...bedrock,
        baseUrl: `http://localhost:${server.port}/v1`,
        modelId: "openai.gpt-oss-120b",
        apiKey: "bedrock-key",
      });
      await agent.generate({ prompt: "hi" }).catch(() => undefined);
      expect(seen[0]).toEqual({ path: "/v1/chat/completions", auth: "Bearer bedrock-key" });
    } finally {
      server.stop(true);
    }
  });
});

describe("createModel vertex", () => {
  const vertex = {
    provider: "vertex",
    baseUrl: "https://aiplatform.googleapis.com/v1/projects/p/locations/global/endpoints/openapi",
  } as const;

  test("needs an endpoint, a model and a credential", () => {
    expect(() => createModel({ provider: "vertex", modelId: "m" }, "k")).toThrow(
      "project endpoint",
    );
    expect(() => createModel(vertex, "k")).toThrow("model id");
    expect(() => createModel({ ...vertex, modelId: "m" }, undefined)).toThrow("credential");
    expect(createModel({ ...vertex, modelId: "google/gemini-2.5-flash" }, "k").modelId).toBe(
      "google/gemini-2.5-flash",
    );
  });

  test("offers an effort control only from levels the host supplies", () => {
    const config = { ...vertex, modelId: "google/gemini-2.5-flash" };
    expect(reasoningControlsFor(config)).toBeNull();
    expect(reasoningControlsFor({ ...config, effortLevels: ["low", "high"] })?.options).toEqual([
      "low",
      "high",
    ]);
  });
});

describe("createModel gemini", () => {
  test("needs a key and has a default model", () => {
    expect(() => createModel({ provider: "gemini" }, undefined)).toThrow("API key");
    const model = createModel({ provider: "gemini" }, "k");
    expect(model.provider).toBe("gemini");
    expect(model.modelId).toBe("gemini-2.5-pro");
    expect(createModel({ provider: "gemini", modelId: "gemini-2.5-flash" }, "k").modelId).toBe(
      "gemini-2.5-flash",
    );
  });

  test("reports the SDK's effort levels per model", () => {
    expect(
      reasoningControlsFor({ provider: "gemini", modelId: "gemini-2.5-pro" })?.options,
    ).toEqual(["low", "medium", "high"]);
    expect(reasoningControlsFor({ provider: "gemini", modelId: "gemini-2.0-flash" })).toBeNull();
  });

  test("a base URL is where the SDK sends its requests, with the key in x-goog-api-key", async () => {
    const seen: { path: string; key: string | null }[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        seen.push({ path: new URL(req.url).pathname, key: req.headers.get("x-goog-api-key") });
        return Response.json(
          { error: { code: 400, message: "stop", status: "INVALID_ARGUMENT" } },
          { status: 400 },
        );
      },
    });
    try {
      const { agent } = createCodingAgent({
        tools: [],
        provider: "gemini",
        modelId: "gemini-2.5-flash",
        apiKey: "gw-token",
        baseUrl: `http://localhost:${server.port}/prefix`,
      });
      await agent.generate({ prompt: "hi" }).catch(() => undefined);
      expect(seen[0]).toEqual({
        path: "/prefix/v1beta/models/gemini-2.5-flash:generateContent",
        key: "gw-token",
      });
    } finally {
      server.stop(true);
    }
  });
});

describe("createModel azure", () => {
  const azure = { provider: "azure", baseUrl: "https://r.openai.azure.com/openai/v1" } as const;

  test("needs a resource URL, a deployment and a key", () => {
    expect(() => createModel({ provider: "azure", modelId: "d" }, "k")).toThrow("resource URL");
    expect(() => createModel(azure, "k")).toThrow("deployment");
    expect(() => createModel({ ...azure, modelId: "d" }, undefined)).toThrow("API key");
    expect(createModel({ ...azure, modelId: "d" }, "k").provider).toBe("azure-openai");
  });

  test("OpenAI's models use the Responses API and the rest chat completions, which streams them", () => {
    for (const id of ["gpt-5.5", "o3", "gpt-5.1-codex", "GPT-4o"]) {
      expect(azureApiFor(id)).toBe("responses");
    }
    for (const id of ["DeepSeek-V4.1-Flash", "grok-4.6", "Llama-4", "alphax-8885-resource"]) {
      expect(azureApiFor(id)).toBe("chat");
    }
  });

  test("reports the SDK's effort levels for the deployment's model name", () => {
    expect(reasoningControlsFor({ provider: "azure", modelId: "o3" })?.options).toEqual([
      "low",
      "medium",
      "high",
    ]);
    expect(reasoningControlsFor({ provider: "azure" })).toBeNull();
  });
});

describe("reasoningControlsFor", () => {
  test("reports the levels the SDK accepts for a model", () => {
    const sonnet = reasoningControlsFor({ provider: "anthropic", modelId: "claude-sonnet-5" });
    expect(sonnet?.options).toContain("high");
    expect(sonnet?.defaultValue).toBe("high");
    expect(reasoningControlsFor({ provider: "openai", modelId: "o3" })?.options).toEqual([
      "low",
      "medium",
      "high",
    ]);
  });

  test("levels the host supplies give a model the SDK does not know an effort control", () => {
    const config = { provider: "anthropic", modelId: "claude-haiku-5-5" } as const;
    expect(reasoningControlsFor(config)).toBeNull();
    expect(reasoningControlsFor({ ...config, effortLevels: ["low", "high"] })?.options).toEqual([
      "low",
      "high",
    ]);
  });

  test("a server gets the control only from the levels it listed itself", () => {
    const config = { provider: "openai-compatible", modelId: "muse" } as const;
    expect(reasoningControlsFor(config)).toBeNull();
    expect(reasoningControlsFor({ ...config, effortLevels: [] })).toBeNull();
    expect(reasoningControlsFor({ ...config, effortLevels: ["low", "max"] })?.options).toEqual([
      "low",
      "max",
    ]);
    expect(
      reasoningControlsFor({ provider: "openai-compatible", effortLevels: ["low"] }),
    ).toBeNull();
  });

  test("is null for models and servers without the control", () => {
    expect(reasoningControlsFor({ provider: "openai", modelId: "gpt-4o" })).toBeNull();
    expect(
      reasoningControlsFor({ provider: "anthropic", modelId: "claude-haiku-4-5-20251001" }),
    ).toBeNull();
    expect(reasoningControlsFor({ provider: "openai-compatible", modelId: "llama3" })).toBeNull();
  });
});

describe("anthropic request", () => {
  const bodies: Record<string, unknown>[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      bodies.push((await req.json()) as Record<string, unknown>);
      return Response.json(
        { type: "error", error: { type: "invalid_request_error", message: "stop" } },
        { status: 400 },
      );
    },
  });
  afterAll(() => server.stop(true));

  test("the SDK sends a top-level cache_control", async () => {
    const model = new AnthropicClient({
      apiKey: "k",
      baseUrl: `http://localhost:${server.port}`,
    }).completionModel({ modelId: "claude-sonnet-5" });
    const agent = new Agent({
      id: "t",
      model,
      instructions: "be brief",
      providerOptions: providerOptionsFor("anthropic"),
    });
    await agent.generate({ prompt: "hello" }).catch(() => undefined);
    expect(bodies[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  test("an effort on a model the SDK does not know is sent as output_config.effort", async () => {
    const before = bodies.length;
    const { agent } = createCodingAgent({
      model: new AnthropicClient({
        apiKey: "k",
        baseUrl: `http://localhost:${server.port}`,
      }).completionModel({
        modelId: "claude-haiku-5-5",
        controls: defineCompletionModelControls({
          reasoningEffort: { type: "select", label: "Reasoning effort", options: ["low", "high"] },
        }) as never,
      }),
      tools: [],
    });
    await agent
      .generate({ prompt: "hi", controls: { reasoningEffort: "low" } as never })
      .catch(() => undefined);
    expect(bodies[before]?.output_config).toEqual({ effort: "low" });
  });

  test("the coding agent carries the chosen reasoning effort", async () => {
    const { agent } = createCodingAgent({
      provider: "anthropic",
      modelId: "claude-sonnet-5",
      apiKey: "k",
      reasoningEffort: "low",
      tools: [],
    });
    expect(agent.controls).toEqual({ reasoningEffort: "low" });
  });
});

describe("openai-compatible request", () => {
  const bodies: Record<string, unknown>[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      bodies.push((await req.json()) as Record<string, unknown>);
      return Response.json({ error: { message: "stop" } }, { status: 400 });
    },
  });
  afterAll(() => server.stop(true));

  const ask = async (extra: { effortLevels?: string[]; reasoningEffort?: string }) => {
    const before = bodies.length;
    const { agent } = createCodingAgent({
      provider: "openai-compatible",
      baseUrl: `http://localhost:${server.port}/v1`,
      modelId: "muse",
      apiKey: "k",
      tools: [],
      ...extra,
    });
    await agent.generate({ prompt: "hi" }).catch(() => undefined);
    return bodies[before];
  };

  test("an effort the server listed is sent as reasoning_effort", async () => {
    const body = await ask({ effortLevels: ["low", "high", "max"], reasoningEffort: "max" });
    expect(body?.reasoning_effort).toBe("max");
  });

  test("a server that listed no levels is sent no reasoning_effort", async () => {
    const body = await ask({});
    expect(body).toBeDefined();
    expect(body && "reasoning_effort" in body).toBe(false);
  });
});

describe("createModel", () => {
  test("a model the SDK does not know reports context only when given its window", () => {
    const unknown = { provider: "anthropic", modelId: "claude-not-yet-known" } as const;
    expect(createModel(unknown, "x").contextLimits).toBeUndefined();
    expect(createModel({ ...unknown, contextWindow: 200_000 }, "x").contextLimits).toEqual({
      contextWindow: 200_000,
    });
  });

  test("uses no key from the environment, only the one it is given", () => {
    const saved = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    };
    const restore = () => {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    };
    try {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GEMINI_API_KEY;
      expect(() => createModel({ provider: "openai" }, undefined)).toThrow("API key");
      expect(() => createModel({ provider: "anthropic" }, undefined)).toThrow("API key");
      expect(() => createModel({ provider: "gemini" }, undefined)).toThrow("API key");
      process.env.OPENAI_API_KEY = "ambient-openai";
      process.env.ANTHROPIC_API_KEY = "ambient-anthropic";
      process.env.GEMINI_API_KEY = "ambient-gemini";
      expect(() => createModel({ provider: "openai" }, undefined)).toThrow("API key");
      expect(() => createModel({ provider: "anthropic" }, undefined)).toThrow("API key");
      expect(() => createModel({ provider: "gemini" }, undefined)).toThrow("API key");
      expect(createModel({ provider: "openai" }, "k").provider).toBe("openai");
      expect(createModel({ provider: "anthropic" }, "k").provider).toBe("anthropic");
      expect(createModel({ provider: "gemini" }, "k").provider).toBe("gemini");
    } finally {
      restore();
    }
  });

  test("sends the key it was given, not the ambient one", async () => {
    const seen: (string | null)[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        seen.push(request.headers.get("authorization"));
        return Response.json({ error: { message: "stop" } }, { status: 400 });
      },
    });
    const saved = process.env.OPENAI_API_KEY;
    try {
      process.env.OPENAI_API_KEY = "ambient-openai";
      const model = createModel(
        { provider: "openai", modelId: "gpt-4o", baseUrl: `http://localhost:${server.port}/v1` },
        "explicit-key",
      );
      const agent = new Agent({ id: "t", model, instructions: "be brief" });
      await agent.generate({ prompt: "hi" }).catch(() => undefined);
      expect(seen[0]).toBe("Bearer explicit-key");
    } finally {
      if (saved === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = saved;

      server.stop(true);
    }
  });

  test("an unknown provider throws instead of falling back to anthropic", () => {
    const unknown = { provider: "mystery" } as unknown as ModelConfig;
    expect(() => createModel(unknown, "k")).toThrow("Unknown model provider");
  });
});
