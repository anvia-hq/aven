import { createPrivateKey } from "node:crypto";
import { describe, expect, test } from "bun:test";

import { addMissingKeys, newSecrets, newServerEnv, parseEnv, setEnv } from "./env-file";

describe("parseEnv", () => {
  test("reads values, keeping what follows the first =", () => {
    expect(parseEnv("# c\n\nA=1\nB=x=y==\nbad line\nC=")).toEqual({ A: "1", B: "x=y==", C: "" });
  });
});

describe("setEnv", () => {
  test("replaces in place, appends new keys and keeps comments", () => {
    const out = setEnv("# note\nA=1\nB=2\n", { B: "3", C: "4" });
    expect(out).toBe("# note\nA=1\nB=3\nC=4\n");
  });

  test("does not touch a key that only starts the same", () => {
    expect(setEnv("AB=1\n", { A: "2" })).toBe("AB=1\nA=2\n");
  });
});

describe("newSecrets", () => {
  test("makes what the server reads", () => {
    const s = newSecrets();
    expect(Buffer.from(s.PROVIDER_ENCRYPTION_KEY, "base64")).toHaveLength(32);
    expect(Buffer.from(s.BETTER_AUTH_SECRET, "base64")).toHaveLength(32);
    expect(s.AVEN_LOCAL_RUNNER_TOKEN).toMatch(/^avrt_[0-9a-f]{48}$/);
    // The identity key is one line, and with its \n turned back into line breaks a usable key.
    expect(s.WORKLOAD_IDENTITY_PRIVATE_KEY).not.toContain("\n");
    const key = createPrivateKey(s.WORKLOAD_IDENTITY_PRIVATE_KEY.replaceAll("\\n", "\n"));
    expect(key.asymmetricKeyDetails?.namedCurve).toBe("prime256v1");
  });

  test("never makes the same twice", () => {
    expect(newSecrets().POSTGRES_PASSWORD).not.toBe(newSecrets().POSTGRES_PASSWORD);
  });
});

describe("newServerEnv", () => {
  test("fills the template's address and secrets and keeps the rest", () => {
    const template =
      "AVEN_VERSION=latest\nAVEN_PORT=3000\nBETTER_AUTH_URL=x\nTRUSTED_ORIGINS=x\nBETTER_AUTH_SECRET=\nPLATFORM_OWNER_EMAILS=\n";
    const env = parseEnv(
      newServerEnv(template, { origin: "http://localhost:3900", port: 3900, version: "0.2.0" }),
    );
    expect(env.AVEN_VERSION).toBe("0.2.0");
    expect(env.AVEN_PORT).toBe("3900");
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:3900");
    expect(env.TRUSTED_ORIGINS).toBe("http://localhost:3900");
    expect(env.BETTER_AUTH_SECRET).not.toBe("");
    expect(env.PLATFORM_OWNER_EMAILS).toBe("");
  });
});

describe("addMissingKeys", () => {
  test("adds what the template has and the file lacks, making secrets, and changes nothing else", () => {
    const template = "A=1\nB=2\nAVEN_LOCAL_RUNNER_TOKEN=\n";
    const out = parseEnv(addMissingKeys("A=mine\n", template));
    expect(out.A).toBe("mine");
    expect(out.B).toBe("2");
    expect(out.AVEN_LOCAL_RUNNER_TOKEN).toMatch(/^avrt_/);
    expect(addMissingKeys("A=1\nB=2\nAVEN_LOCAL_RUNNER_TOKEN=x\n", template)).toBe(
      "A=1\nB=2\nAVEN_LOCAL_RUNNER_TOKEN=x\n",
    );
  });
});

test("a new server env names the owner when there is one", () => {
  const template = "PLATFORM_OWNER_EMAILS=\n";
  const base = { origin: "http://x", port: 1, version: "1" };
  expect(
    parseEnv(newServerEnv(template, { ...base, ownerEmail: "me@example.com" }))
      .PLATFORM_OWNER_EMAILS,
  ).toBe("me@example.com");
  expect(parseEnv(newServerEnv(template, base)).PLATFORM_OWNER_EMAILS).toBe("");
});

describe("the address the web port is published on", () => {
  const template = "AVEN_BIND=127.0.0.1\nAVEN_PORT=2836\n";

  test("a new install gets the bind it was planned with", () => {
    const base = { origin: "http://x", port: 1, version: "1" };
    expect(parseEnv(newServerEnv(template, { ...base, bind: "0.0.0.0" })).AVEN_BIND).toBe(
      "0.0.0.0",
    );
    expect(parseEnv(newServerEnv(template, { ...base, bind: "127.0.0.1" })).AVEN_BIND).toBe(
      "127.0.0.1",
    );
  });

  test("an install from before the setting keeps behaving as it did: every address", () => {
    // The template says loopback, for a new install; an old one must not be moved by an update.
    const updated = addMissingKeys("AVEN_PORT=3000\n", template);
    expect(parseEnv(updated).AVEN_BIND).toBe("");
    expect(parseEnv(updated).AVEN_PORT).toBe("3000");
  });

  test("a value somebody set is kept", () => {
    expect(parseEnv(addMissingKeys("AVEN_BIND=100.64.0.7\n", template)).AVEN_BIND).toBe(
      "100.64.0.7",
    );
    expect(parseEnv(addMissingKeys("AVEN_BIND=\n", template)).AVEN_BIND).toBe("");
  });
});
