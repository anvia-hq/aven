import { describe, expect, test } from "bun:test";

import { signBrowserToken, verifyBrowserToken } from "./token";

const secret = new TextEncoder().encode("a secret of the server");
const claims = { organizationId: "org", threadId: "thread", port: 3000 };

describe("a browser token", () => {
  test("carries the thread and the port it was made for", () => {
    const token = signBrowserToken(secret, "ticket", claims, 60_000);
    expect(verifyBrowserToken(secret, "ticket", token)).toEqual(claims);
  });

  test("is refused as the other kind, so a ticket is not a page cookie", () => {
    const ticket = signBrowserToken(secret, "ticket", claims, 60_000);
    const page = signBrowserToken(secret, "page", claims, 60_000);
    expect(verifyBrowserToken(secret, "page", ticket)).toBeNull();
    expect(verifyBrowserToken(secret, "ticket", page)).toBeNull();
  });

  test("runs out", () => {
    const token = signBrowserToken(secret, "ticket", claims, 1_000, 1_000_000);
    expect(verifyBrowserToken(secret, "ticket", token, 1_000_999)).toEqual(claims);
    expect(verifyBrowserToken(secret, "ticket", token, 1_001_000)).toBeNull();
  });

  test("is refused when changed, made with another secret, or not a token", () => {
    const token = signBrowserToken(secret, "ticket", claims, 60_000);
    const [body, signed] = token.split(".");
    const other = Buffer.from(
      JSON.stringify({ k: "ticket", ...claims, port: 22, exp: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(verifyBrowserToken(secret, "ticket", `${other}.${signed}`)).toBeNull();
    expect(verifyBrowserToken(secret, "ticket", `${body}.${signed}x`)).toBeNull();
    expect(verifyBrowserToken(new TextEncoder().encode("another"), "ticket", token)).toBeNull();
    expect(verifyBrowserToken(secret, "ticket", "")).toBeNull();
    expect(verifyBrowserToken(secret, "ticket", "a.b.c")).toBeNull();
  });
});
