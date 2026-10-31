import { describe, expect, test } from "bun:test";

import { compactionFor, resolveAgentModel } from "./agent-model";
import { scriptedModel } from "./testing/scripted-model";

const model = scriptedModel([]);

describe("resolveAgentModel", () => {
  test("a ready model comes as it is, with no provider settings", () => {
    const resolved = resolveAgentModel({ model });
    expect(resolved.model).toBe(model);
    expect(resolved.providerOptions).toBeUndefined();
    expect(resolved.controls).toBeUndefined();
    expect(resolved.retries).toEqual({ maxAttempts: 5 });
  });

  test("a provider's config brings its options and the reasoning effort chosen", () => {
    const anthropic = resolveAgentModel({ provider: "anthropic", apiKey: "k" });
    expect(anthropic.providerOptions).toEqual({ cache_control: { type: "ephemeral" } });
    expect(anthropic.controls).toBeUndefined();

    const openai = resolveAgentModel({ provider: "openai", apiKey: "k", reasoningEffort: "high" });
    expect(openai.providerOptions).toBeUndefined();
    expect(openai.controls).toEqual({ reasoningEffort: "high" });
  });
});

describe("compactionFor", () => {
  test("summarizes at 70% of the model's context window", () => {
    const source = { provider: "openai", apiKey: "k", contextWindow: 100_000 } as const;
    expect(compactionFor(source, model)?.trigger).toEqual({ afterTokens: 70_000 });
  });

  test("a size the host gave wins over the window, and works without one", () => {
    const windowed = { provider: "openai", apiKey: "k", contextWindow: 100_000 } as const;
    expect(compactionFor(windowed, model, 5_000)?.trigger).toEqual({ afterTokens: 5_000 });
    expect(compactionFor({ model }, model, 5_000)?.trigger).toEqual({ afterTokens: 5_000 });
  });

  test("with neither there is nothing to measure against, so history is left whole", () => {
    expect(compactionFor({ provider: "openai", apiKey: "k" }, model)).toBeUndefined();
    expect(compactionFor({ model }, model)).toBeUndefined();
  });
});
