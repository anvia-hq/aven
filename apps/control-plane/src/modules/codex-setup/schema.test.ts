import { describe, expect, test } from "bun:test";

import { saveCodexSetupBody } from "./schema";

const TOKEN = `sk-${"a".repeat(20)}`;

describe("a Codex API key", () => {
  test("is one line, starts with sk-, and is long enough", () => {
    expect(saveCodexSetupBody.safeParse({ token: TOKEN }).success).toBe(true);
    expect(saveCodexSetupBody.safeParse({ token: `  ${TOKEN}  ` }).success).toBe(true);
    expect(saveCodexSetupBody.safeParse({ token: `sk-proj-${"b".repeat(20)}` }).success).toBe(true);
    expect(saveCodexSetupBody.safeParse({ token: "too-short" }).success).toBe(false);
    expect(saveCodexSetupBody.safeParse({ token: "x".repeat(40) }).success).toBe(false);
    expect(saveCodexSetupBody.safeParse({ token: `sk-ant-${"a".repeat(20)}` }).success).toBe(false);
    expect(saveCodexSetupBody.safeParse({ token: "sk-short" }).success).toBe(false);
    expect(saveCodexSetupBody.safeParse({ token: `${TOKEN} ${"y".repeat(4)}` }).success).toBe(
      false,
    );
    expect(saveCodexSetupBody.safeParse({ token: `${TOKEN}\n` }).success).toBe(true);
    expect(
      saveCodexSetupBody.safeParse({ token: `${TOKEN.slice(0, 20)}\n${"y".repeat(10)}` }).success,
    ).toBe(false);
  });
});
