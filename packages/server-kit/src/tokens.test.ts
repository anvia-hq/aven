import { describe, expect, test } from "bun:test";

import {
  bearerToken,
  hashOpaqueToken,
  issueOpaqueToken,
  sameOpaqueToken,
  signHmacJson,
  verifyHmacJson,
  verifyOpaqueTokenHash,
} from "./tokens";

describe("tokens", () => {
  test("bearerToken extracts tokens case-insensitively", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
    expect(bearerToken("bearer   xyz")).toBe("xyz");
    expect(bearerToken("Basic abc")).toBeUndefined();
    expect(bearerToken(null)).toBeUndefined();
  });

  test("opaque tokens hash, hint, and verify", () => {
    const issued = issueOpaqueToken("avrt_");
    expect(issued.token.startsWith("avrt_")).toBe(true);
    expect(issued.tokenHint).toBe(issued.token.slice(-4));
    expect(issued.tokenHash).toBe(hashOpaqueToken(issued.token));
    expect(verifyOpaqueTokenHash(issued.token, issued.tokenHash)).toBe(true);
    expect(verifyOpaqueTokenHash("avrt_wrong", issued.tokenHash)).toBe(false);
    expect(sameOpaqueToken(issued.token, issued.token)).toBe(true);
    expect(sameOpaqueToken(issued.token, "other")).toBe(false);
  });

  test("HMAC JSON tokens round-trip and reject tampering or wrong purpose", () => {
    const secret = "test-secret";
    const signed = signHmacJson(secret, { id: "1", ok: true }, "setup");
    expect(verifyHmacJson(secret, signed, "setup")).toEqual({ id: "1", ok: true });
    expect(verifyHmacJson(secret, signed, "other")).toBeNull();
    expect(verifyHmacJson("wrong-secret", signed, "setup")).toBeNull();
    expect(verifyHmacJson(secret, `${signed}x`, "setup")).toBeNull();
  });
});
