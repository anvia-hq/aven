import { describe, expect, test } from "bun:test";

import { codexAuthSecrets, parseCodexAuth } from "./codex-auth";

const file = JSON.stringify({
  auth_mode: "chatgpt",
  tokens: { id_token: "id", access_token: "access", refresh_token: "refresh", account_id: "a" },
});

describe("codex auth file", () => {
  test("reads a ChatGPT sign-in and lists its secrets", () => {
    const auth = parseCodexAuth(file)!;
    expect(auth.tokens.refresh_token).toBe("refresh");
    expect(codexAuthSecrets(auth)).toEqual(["access", "refresh", "id"]);
  });

  test("refuses an API key and broken JSON", () => {
    expect(parseCodexAuth("sk-abcdefghijklmnopqrstuvwxyz")).toBeUndefined();
    expect(parseCodexAuth("{")).toBeUndefined();
    expect(parseCodexAuth('{"tokens":{"access_token":"x"}}')).toBeUndefined();
  });
});
