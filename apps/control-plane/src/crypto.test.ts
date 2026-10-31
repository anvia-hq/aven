import { beforeAll, describe, expect, test } from "bun:test";

import { decryptSecret, encryptSecret } from "./crypto";

beforeAll(() => {
  process.env.PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("stored secrets", () => {
  test("round-trips and never stores the plain text", () => {
    const stored = encryptSecret("sk-secret-1234");
    expect(stored).not.toContain("sk-secret");
    expect(decryptSecret(stored)).toBe("sk-secret-1234");
  });

  test("uses a fresh IV each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  test("rejects tampering", () => {
    const [iv, tag, data] = encryptSecret("sk-secret-1234").split(".");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptSecret([iv, tag, flipped.toString("base64")].join("."))).toThrow();
  });

  test("requires a 32 byte key", () => {
    process.env.PROVIDER_ENCRYPTION_KEY = "short";
    expect(() => encryptSecret("x")).toThrow("PROVIDER_ENCRYPTION_KEY");
    process.env.PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });
});
