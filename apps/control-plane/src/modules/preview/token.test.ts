import { describe, expect, test } from "bun:test";

import { SpentTickets, sameClaims, signPreviewToken, verifyPreviewToken } from "./token";

const secret = new TextEncoder().encode("the server's secret");
const claims = { runtimeId: "00000000-0000-4000-8000-000000000001", port: 3000 };

describe("a preview's token", () => {
  test("names a runtime and a port, and expires", () => {
    const token = signPreviewToken(secret, "ticket", claims, 60_000, 1_000);
    const grant = verifyPreviewToken(secret, "ticket", token, 2_000);
    expect(grant?.claims).toEqual(claims);
    expect(grant?.expiresAt).toBe(61_000);
    expect(verifyPreviewToken(secret, "ticket", token, 61_000)).toBeNull();
  });

  test("is refused as another kind, with another secret, or when it is changed", () => {
    const token = signPreviewToken(secret, "ticket", claims, 60_000);
    expect(verifyPreviewToken(secret, "page", token)).toBeNull();
    expect(verifyPreviewToken(new TextEncoder().encode("another"), "ticket", token)).toBeNull();
    expect(verifyPreviewToken(secret, "ticket", `${token}x`)).toBeNull();
    expect(verifyPreviewToken(secret, "ticket", "nonsense")).toBeNull();
    expect(verifyPreviewToken(secret, "ticket", "")).toBeNull();
  });

  test("tells two hosts apart", () => {
    expect(sameClaims(claims, { ...claims })).toBe(true);
    expect(sameClaims(claims, { ...claims, port: 3001 })).toBe(false);
    expect(sameClaims(claims, { ...claims, runtimeId: "another" })).toBe(false);
  });
});

describe("a spent ticket", () => {
  test("is forgotten once it has expired", () => {
    const ledger = new SpentTickets();
    expect(ledger.spend("ticket", 1_000, 0)).toBe(true);
    expect(ledger.spend("ticket", 1_000, 999)).toBe(false);
    expect(ledger.spend("ticket", 1_000, 1_000)).toBe(true);
  });
});
