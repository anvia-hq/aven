import { describe, expect, test } from "bun:test";

import { saveCodexLoginBody } from "./schema";

const access = "eyJhbGciOiJub25lIn0.payload.signature";

describe("a saved ChatGPT login", () => {
  test("accepts a token and auth.json, and refuses anything else", () => {
    expect(saveCodexLoginBody.safeParse({ login: access }).success).toBe(true);
    expect(
      saveCodexLoginBody.safeParse({
        login: JSON.stringify({
          tokens: { access_token: access, refresh_token: "refresh-token-value-9988" },
        }),
      }).success,
    ).toBe(true);
    expect(saveCodexLoginBody.safeParse({ login: "too-short" }).success).toBe(false);
    expect(saveCodexLoginBody.safeParse({ login: JSON.stringify({ tokens: {} }) }).success).toBe(
      false,
    );
  });
});
