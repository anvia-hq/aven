import { describe, expect, test } from "bun:test";

import { updateBotBody } from "./schema";

describe("updateBotBody", () => {
  test("takes a compaction size within bounds, or none to leave it to the model", () => {
    expect(updateBotBody.safeParse({ compactAfterTokens: 50_000 }).success).toBe(true);
    expect(updateBotBody.safeParse({ compactAfterTokens: null }).success).toBe(true);
    expect(updateBotBody.safeParse({ compactAfterTokens: 10 }).success).toBe(false);
    expect(updateBotBody.safeParse({ compactAfterTokens: 3_000_000 }).success).toBe(false);
    expect(updateBotBody.safeParse({ compactAfterTokens: 1500.5 }).success).toBe(false);
  });

  test("takes an effort or none", () => {
    expect(updateBotBody.safeParse({ reasoningEffort: "high" }).success).toBe(true);
    expect(updateBotBody.safeParse({ reasoningEffort: null }).success).toBe(true);
    expect(updateBotBody.safeParse({ reasoningEffort: "" }).success).toBe(false);
  });
});
