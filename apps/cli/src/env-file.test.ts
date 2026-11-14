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
  test("makes the template's secrets, takes the settings listed, leaves the rest, and changes nothing else", () => {
    const template = "A=1\nB=2\nAVEN_LOCAL_RUNNER_TOKEN=\nAVEN_LOCAL_RUNNER=host\n";
    const out = parseEnv(addMissingKeys("A=mine\n", template));
    expect(out.A).toBe("mine");
    expect(out.B).toBeUndefined();
    expect(out.AVEN_LOCAL_RUNNER_TOKEN).toMatch(/^avrt_/);
    expect(out.AVEN_LOCAL_RUNNER).toBe("host");
    expect(
      addMissingKeys("A=1\nB=2\nAVEN_LOCAL_RUNNER_TOKEN=x\nAVEN_LOCAL_RUNNER=off\n", template),
    ).toBe("A=1\nB=2\nAVEN_LOCAL_RUNNER_TOKEN=x\nAVEN_LOCAL_RUNNER=off\n");
  });
});

describe("a setting the template adds", () => {
  test("a new key a policy does not name leaves the install alone", () => {
    const out = parseEnv(
      addMissingKeys("AVEN_PORT=3000\n", "AVEN_NEW_SETTING=on\nAVEN_PORT=2836\n"),
    );
    expect(out.AVEN_NEW_SETTING).toBeUndefined();
    expect(out.AVEN_PORT).toBe("3000");
  });

  test("a new key a policy names keeps the install's own value, taken from the policy", () => {
    const out = parseEnv(addMissingKeys("AVEN_PORT=3000\n", "AVEN_BIND=127.0.0.1\n"));
    expect(out.AVEN_BIND).toBe("");
  });

  test("a new key a policy names takes the template's value", () => {
    const out = parseEnv(addMissingKeys("", "AVEN_LOCAL_RUNNER=host\n"));
    expect(out.AVEN_LOCAL_RUNNER).toBe("host");
  });

  test("a key the file already has is kept, whatever the policy says", () => {
    expect(
      parseEnv(addMissingKeys("AVEN_LOCAL_RUNNER=off\n", "AVEN_LOCAL_RUNNER=host\n"))
        .AVEN_LOCAL_RUNNER,
    ).toBe("off");
    expect(parseEnv(addMissingKeys("AVEN_BIND=0.0.0.0\n", "AVEN_BIND=127.0.0.1\n")).AVEN_BIND).toBe(
      "0.0.0.0",
    );
    expect(parseEnv(addMissingKeys("AVEN_BIND=\n", "AVEN_BIND=127.0.0.1\n")).AVEN_BIND).toBe("");
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
});

test("a new server env says whether sign-ups start closed", () => {
  const template = "AVEN_REGISTRATION=open\n";
  const base = { origin: "http://x", port: 1, version: "1" };
  expect(
    parseEnv(newServerEnv(template, { ...base, registration: "closed" })).AVEN_REGISTRATION,
  ).toBe("closed");
  expect(parseEnv(newServerEnv(template, base)).AVEN_REGISTRATION).toBe("open");
});

test("an install from before sign-ups were a setting is left alone, and stays open", () => {
  expect(
    parseEnv(addMissingKeys("A=1\n", "AVEN_REGISTRATION=open\n")).AVEN_REGISTRATION,
  ).toBeUndefined();
});
