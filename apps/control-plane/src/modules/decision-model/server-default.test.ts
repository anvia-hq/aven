import { describe, expect, test } from "bun:test";

import { serverDecisionModel } from "./server-default";

describe("serverDecisionModel", () => {
  test("is none without a key", () => {
    expect(serverDecisionModel({})).toBeNull();
    expect(
      serverDecisionModel({ DECISION_MODEL_KIND: "jev", DECISION_MODEL_API_KEY: "  " }),
    ).toBeNull();
  });

  test("defaults to Jev through OpenRouter and that kind's model", () => {
    expect(serverDecisionModel({ DECISION_MODEL_API_KEY: "sk-or-v1-abc" })).toEqual({
      kind: "jev-openrouter",
      modelId: "typesafe/jev-1.13",
      apiKey: "sk-or-v1-abc",
    });
  });

  test("takes a kind and a model of its own", () => {
    expect(
      serverDecisionModel({
        DECISION_MODEL_KIND: "jev",
        DECISION_MODEL_ID: "jev-x",
        DECISION_MODEL_API_KEY: "k",
      }),
    ).toEqual({ kind: "jev", modelId: "jev-x", apiKey: "k" });
    expect(
      serverDecisionModel({ DECISION_MODEL_KIND: "jev", DECISION_MODEL_API_KEY: "k" })?.modelId,
    ).toBe("jev-latest");
  });

  test("refuses a kind it does not know", () => {
    expect(() =>
      serverDecisionModel({ DECISION_MODEL_KIND: "gpt", DECISION_MODEL_API_KEY: "k" }),
    ).toThrow(/DECISION_MODEL_KIND/);
  });
});
