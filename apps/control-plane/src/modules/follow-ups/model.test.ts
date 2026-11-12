import { describe, expect, test } from "bun:test";

import { followUpModel } from "./model";

const server = { SMALL_MODEL_API_KEY: "k", SMALL_MODEL_ID: "small-1" };

describe("followUpModel", () => {
  test("a person with no provider of their own gets the server's small model", async () => {
    expect(
      await followUpModel("u", { enabled: true, providerId: null, modelId: null }, server),
    ).toEqual({ provider: "anthropic", modelId: "small-1", apiKey: "k" });
  });

  test("a person with no provider and no server model gets none", async () => {
    expect(
      await followUpModel("u", { enabled: true, providerId: null, modelId: null }, {}),
    ).toBeNull();
  });
});
