import { describe, expect, test } from "bun:test";

import { saveClaudeSetupBody } from "./schema";

const TOKEN = `sk-ant-oat01-${"a".repeat(16)}`;

describe("a Claude setup token", () => {
  test("is one line, starts with the setup-token prefix, and is long enough", () => {
    expect(saveClaudeSetupBody.safeParse({ token: TOKEN }).success).toBe(true);
    expect(saveClaudeSetupBody.safeParse({ token: `  ${TOKEN}  ` }).success).toBe(true);
    expect(saveClaudeSetupBody.safeParse({ token: "too-short" }).success).toBe(false);
    expect(saveClaudeSetupBody.safeParse({ token: "x".repeat(40) }).success).toBe(false);
    expect(saveClaudeSetupBody.safeParse({ token: `sk-ant-api03-${"a".repeat(20)}` }).success).toBe(
      false,
    );
    expect(saveClaudeSetupBody.safeParse({ token: "sk-ant-oat01-short" }).success).toBe(false);
    expect(saveClaudeSetupBody.safeParse({ token: `${TOKEN} ${"y".repeat(4)}` }).success).toBe(
      false,
    );
    expect(saveClaudeSetupBody.safeParse({ token: `${TOKEN}\n` }).success).toBe(true);
    expect(
      saveClaudeSetupBody.safeParse({ token: `${TOKEN.slice(0, 20)}\n${"y".repeat(10)}` }).success,
    ).toBe(false);
  });
});
