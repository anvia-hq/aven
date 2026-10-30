import { afterAll, describe, expect, test } from "bun:test";
import { Agent, defineCompletionModelControls } from "@anvia/core";
import { AnthropicClient } from "@anvia/anthropic";

import { createCodingAgent } from "./coding-agent";
import { azureApiFor, createModel, providerOptionsFor, reasoningControlsFor } from "./model";

describe("providerOptionsFor", () => {
  test("only anthropic gets automatic prompt caching", () => {
    expect(providerOptionsFor("anthropic")).toEqual({ cache_control: { type: "ephemeral" } });
    expect(providerOptionsFor("openai")).toBeUndefined();
    expect(providerOptionsFor("openai-compatible")).toBeUndefined();
    expect(providerOptionsFor("azure")).toBeUndefined();
  });
});

describe("createModel azure", () => {
  const azure = { provider: "azure", baseUrl: "https://r.openai.azure.com/openai/v1" } as const;

  test("needs a resource URL, a deployment and a key", () => {
    expect(() => createModel({ provider: "azure", modelId: "d", apiKey: "k" })).toThrow(
      "resource URL",
    );
    expect(() => createModel({ ...azure, apiKey: "k" })).toThrow("deployment");
    expect(() => createModel({ ...azure, modelId: "d" })).toThrow("API key");
    expect(createModel({ ...azure, modelId: "d", apiKey: "k" }).provider).toBe("azure-openai");
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
      // Only the request matters; a 400 is not retried by the SDK.
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

describe("createModel", () => {
  // The SDK knows the window of some models; for any other the host has to say.
  test("a model the SDK does not know reports context only when given its window", () => {
    const unknown = {
      provider: "anthropic",
      modelId: "claude-not-yet-known",
      apiKey: "x",
    } as const;
    expect(createModel(unknown).contextLimits).toBeUndefined();
    expect(createModel({ ...unknown, contextWindow: 200_000 }).contextLimits).toEqual({
      contextWindow: 200_000,
    });
  });
});
