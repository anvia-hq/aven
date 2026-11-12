import { describe, expect, test } from "bun:test";

import { codexAccessToken, codexModelId, codexSecretValues, CODEX_MODELS } from "./codex-login";

const access = "eyJhbGciOiJub25lIn0.payload.signature";
const refresh = "refresh-token-value-9988";
const idToken = "id-token-value-776655";

describe("a ChatGPT login", () => {
  test("reads an access token on its own, including a trailing newline", () => {
    expect(codexAccessToken(`${access}\n`)).toBe(access);
    expect(codexAccessToken(access)?.slice(-4)).toBe(access.slice(-4));
  });

  test("reads auth.json and keeps every token for redaction", () => {
    const login = JSON.stringify({
      auth_mode: "chatgpt",
      tokens: { access_token: access, refresh_token: refresh, id_token: idToken },
    });

    expect(codexAccessToken(login)).toBe(access);
    expect(codexSecretValues(login)).toEqual(expect.arrayContaining([access, refresh, idToken]));
  });

  test("rejects a newline in the middle, a short value, and json with no access token", () => {
    expect(codexAccessToken(`${access.slice(0, 10)}\n${access.slice(10)}`)).toBeUndefined();
    expect(codexAccessToken("too-short")).toBeUndefined();
    expect(codexAccessToken(JSON.stringify({ tokens: {} }))).toBeUndefined();
  });

  test("accepts only the Codex models a ChatGPT login can call", () => {
    expect(codexModelId(CODEX_MODELS[0].id)).toBe(CODEX_MODELS[0].id);
    expect(codexModelId("claude-sonnet")).toBeUndefined();
    expect(codexModelId(undefined)).toBeUndefined();
  });
});
