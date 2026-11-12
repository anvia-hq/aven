import { describe, expect, test } from "bun:test";

import { saveClaudeSetupBody } from "./schema";

describe("a Claude setup token", () => {
  test("is one line and long enough to be a setup token", () => {
    expect(saveClaudeSetupBody.safeParse({ token: "x".repeat(20) }).success).toBe(true);
    expect(saveClaudeSetupBody.safeParse({ token: `  ${"x".repeat(20)}  ` }).success).toBe(true);
    expect(saveClaudeSetupBody.safeParse({ token: "too-short" }).success).toBe(false);
    expect(
      saveClaudeSetupBody.safeParse({ token: `${"x".repeat(20)} ${"y".repeat(4)}` }).success,
    ).toBe(false);
    expect(saveClaudeSetupBody.safeParse({ token: `${"x".repeat(20)}\n` }).success).toBe(false);
  });
});
