import { describe, expect, test } from "bun:test";

import { serverSmallModel } from "./server-small-model";

describe("serverSmallModel", () => {
  test("is none without a key", () => {
    expect(serverSmallModel({})).toBeNull();
    expect(serverSmallModel({ SMALL_MODEL_ID: "m", SMALL_MODEL_API_KEY: " " })).toBeNull();
  });

  test("defaults to Anthropic and needs a model named", () => {
    expect(serverSmallModel({ SMALL_MODEL_API_KEY: "k", SMALL_MODEL_ID: "small-1" })).toEqual({
      provider: "anthropic",
      modelId: "small-1",
      apiKey: "k",
    });
    expect(() => serverSmallModel({ SMALL_MODEL_API_KEY: "k" })).toThrow(/SMALL_MODEL_ID/);
  });

  test("takes OpenAI or Gemini and refuses another provider", () => {
    expect(
      serverSmallModel({
        SMALL_MODEL_PROVIDER: "openai",
        SMALL_MODEL_API_KEY: "k",
        SMALL_MODEL_ID: "mini",
      })?.provider,
    ).toBe("openai");
    expect(() =>
      serverSmallModel({
        SMALL_MODEL_PROVIDER: "mistral",
        SMALL_MODEL_API_KEY: "k",
        SMALL_MODEL_ID: "m",
      }),
    ).toThrow(/SMALL_MODEL_PROVIDER/);
  });
});
