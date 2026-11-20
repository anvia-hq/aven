import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { decryptOrUnavailable, decryptSecret, encryptSecret } from "./crypto";
import { UnavailableError } from "./errors";

const KEY = Buffer.alloc(32, 7).toString("base64");

const OTHER_KEY = Buffer.alloc(32, 8).toString("base64");

const KEY_ERROR = "PROVIDER_ENCRYPTION_KEY must be 32 bytes, base64 (openssl rand -base64 32)";

const failure = { logged: "Could not decrypt the key:", message: "The key could not be read" };

function setKey(key: string | undefined) {
  if (key === undefined) delete process.env.PROVIDER_ENCRYPTION_KEY;
  else process.env.PROVIDER_ENCRYPTION_KEY = key;
}

describe("stored secrets", () => {
  let previousKey: string | undefined;

  beforeEach(() => {
    previousKey = process.env.PROVIDER_ENCRYPTION_KEY;
    process.env.PROVIDER_ENCRYPTION_KEY = KEY;
  });

  afterEach(() => {
    setKey(previousKey);
  });

  test("round-trips and never stores the plain text", () => {
    const stored = encryptSecret("sk-secret-1234");
    expect(stored).not.toContain("sk-secret");
    expect(decryptSecret(stored)).toBe("sk-secret-1234");
  });

  test("round-trips an empty and a long value", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
    const long = "k".repeat(10_000);
    expect(decryptSecret(encryptSecret(long))).toBe(long);
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

  test("a secret written with one key cannot be read with another", () => {
    const mine = encryptSecret("sk-secret-1234");
    setKey(OTHER_KEY);
    const theirs = encryptSecret("sk-secret-1234");
    expect(() => decryptSecret(mine)).toThrow();
    expect(decryptSecret(theirs)).toBe("sk-secret-1234");

    setKey(KEY);
    expect(() => decryptSecret(theirs)).toThrow();
    expect(decryptSecret(mine)).toBe("sk-secret-1234");
  });

  test("refuses every shape of malformed stored secret", () => {
    for (const stored of ["", "not-a-secret", "a.b", "a.b.c.d", "!!.@@.##", "AA.AA.AA"]) {
      expect(() => decryptSecret(stored)).toThrow("Stored secret is malformed");
    }
  });

  test("gives the stored secret back through decryptOrUnavailable", () => {
    expect(decryptOrUnavailable(encryptSecret("sk-secret-1234"), failure)).toBe("sk-secret-1234");
  });

  test("an unreadable stored secret is unavailable, not a failure to read", () => {
    setKey(OTHER_KEY);
    const otherStored = encryptSecret("sk-secret-1234");
    setKey(KEY);

    const logged: unknown[][] = [];
    const silenced = console.error;
    console.error = (...args: unknown[]) => void logged.push(args);
    try {
      expect(() => decryptOrUnavailable("not-a-secret", failure)).toThrow(UnavailableError);
      expect(() => decryptOrUnavailable(otherStored, failure)).toThrow(UnavailableError);
    } finally {
      console.error = silenced;
    }
    expect(logged).toHaveLength(2);
    expect(logged[0]![0]).toBe(failure.logged);
    expect(JSON.stringify(logged)).not.toContain("sk-secret-1234");
  });
});

describe("lazy encryption key validation", () => {
  let previousKey: string | undefined;

  beforeEach(() => {
    previousKey = process.env.PROVIDER_ENCRYPTION_KEY;
  });

  afterEach(() => {
    setKey(previousKey);
  });

  test("a key that is not 32 bytes fails when encrypting or decrypting", () => {
    setKey(KEY);
    const stored = encryptSecret("secret");

    for (const bad of [
      "short",
      "",
      undefined,
      Buffer.alloc(31, 7).toString("base64"),
      Buffer.alloc(33, 7).toString("base64"),
    ]) {
      setKey(bad);
      expect(() => encryptSecret("secret")).toThrow(KEY_ERROR);
      expect(() => decryptSecret(stored)).toThrow(KEY_ERROR);
    }
  });

  test("importing the module does not require the key to be set", async () => {
    setKey(undefined);
    const loaded = await import(`./crypto.ts?lazy=${crypto.randomUUID()}`);
    expect(typeof loaded.encryptSecret).toBe("function");
    expect(() => loaded.encryptSecret("secret")).toThrow(KEY_ERROR);
  });
});
