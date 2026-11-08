import { describe, expect, test } from "bun:test";

import { UnavailableError } from "./errors";

type Crypto = typeof import("./crypto");

const KEY = Buffer.alloc(32, 7).toString("base64");

const OTHER_KEY = Buffer.alloc(32, 8).toString("base64");

const KEY_ERROR = "PROVIDER_ENCRYPTION_KEY must be 32 bytes, base64 (openssl rand -base64 32)";

const load = async (key: string | undefined) => {
  const previous = process.env.PROVIDER_ENCRYPTION_KEY;
  if (key === undefined) delete process.env.PROVIDER_ENCRYPTION_KEY;
  else process.env.PROVIDER_ENCRYPTION_KEY = key;
  try {
    return (await import(`./crypto.ts?load=${crypto.randomUUID()}`)) as Crypto;
  } finally {
    if (previous === undefined) delete process.env.PROVIDER_ENCRYPTION_KEY;
    else process.env.PROVIDER_ENCRYPTION_KEY = previous;
  }
};

const failureOf = async (key: string | undefined) => {
  try {
    await load(key);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const failure = { logged: "Could not decrypt the key:", message: "The key could not be read" };

describe("stored secrets", async () => {
  const { encryptSecret, decryptSecret, decryptOrUnavailable } = await load(KEY);
  const other = await load(OTHER_KEY);

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
    const theirs = other.encryptSecret("sk-secret-1234");
    expect(() => other.decryptSecret(mine)).toThrow();
    expect(() => decryptSecret(theirs)).toThrow();
    expect(other.decryptSecret(theirs)).toBe("sk-secret-1234");
    expect(decryptSecret(mine)).toBe("sk-secret-1234");
  });

  test("the key is read once, so changing the environment later re-keys nothing", () => {
    const stored = encryptSecret("sk-stable");
    const previous = process.env.PROVIDER_ENCRYPTION_KEY;
    process.env.PROVIDER_ENCRYPTION_KEY = OTHER_KEY;
    try {
      expect(decryptSecret(stored)).toBe("sk-stable");
    } finally {
      if (previous === undefined) delete process.env.PROVIDER_ENCRYPTION_KEY;
      else process.env.PROVIDER_ENCRYPTION_KEY = previous;
    }
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
    const logged: unknown[][] = [];
    const silenced = console.error;
    console.error = (...args: unknown[]) => void logged.push(args);
    try {
      expect(() => decryptOrUnavailable("not-a-secret", failure)).toThrow(UnavailableError);
      expect(() => decryptOrUnavailable(other.encryptSecret("sk-secret-1234"), failure)).toThrow(
        UnavailableError,
      );
    } finally {
      console.error = silenced;
    }
    expect(logged).toHaveLength(2);
    expect(logged[0]![0]).toBe(failure.logged);
    expect(JSON.stringify(logged)).not.toContain("sk-secret-1234");
  });
});

describe("the encryption key at startup", () => {
  test("a key that is not 32 bytes fails when the module loads", async () => {
    expect(await failureOf("short")).toBe(KEY_ERROR);
    expect(await failureOf("")).toBe(KEY_ERROR);
    expect(await failureOf(undefined)).toBe(KEY_ERROR);
    expect(await failureOf(Buffer.alloc(31, 7).toString("base64"))).toBe(KEY_ERROR);
    expect(await failureOf(Buffer.alloc(33, 7).toString("base64"))).toBe(KEY_ERROR);
  });

  test("a 32 byte key in base64 loads", async () => {
    expect(await failureOf(KEY)).toBeNull();
  });
});
