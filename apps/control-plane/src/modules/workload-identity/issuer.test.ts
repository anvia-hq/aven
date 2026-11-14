import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { eq } from "drizzle-orm";

import { keepPlatformSettings } from "../../testing/kept-platform-settings";
import { Issuer, workloadIdentityKeyStore } from "./issuer";
import type { IssuerKeyStore } from "./types";

const url = "https://aven.example/api/workload-identity";
const setting = "workload_identity_private_key";
const run = process.env.DATABASE_URL ? describe : describe.skip;
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

async function verify(token: string, jwks: ReturnType<Issuer["jwks"]>) {
  const [header, payload, signature] = token.split(".") as [string, string, string];
  const jwk = jwks.keys.find((key) => key.kid === decode(header).kid);

  if (!jwk) return false;

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    Buffer.from(signature, "base64url"),
    new TextEncoder().encode(`${header}.${payload}`),
  );
}

async function makePem() {
  const { privateKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----`;
  return { pem, oneLine: pem.replaceAll("\n", "\\n") };
}

function memoryStore(pem: string | null = null) {
  const kept = { pem };
  const store: IssuerKeyStore = {
    load: async () => kept.pem,
    save: async (made: string) => (kept.pem ??= made),
  };
  return { kept, store };
}

async function withEnvKey<T>(key: string, body: () => Promise<T>) {
  const before = process.env.WORKLOAD_IDENTITY_PRIVATE_KEY;
  process.env.WORKLOAD_IDENTITY_PRIVATE_KEY = key;
  try {
    return await body();
  } finally {
    if (before === undefined) delete process.env.WORKLOAD_IDENTITY_PRIVATE_KEY;
    else process.env.WORKLOAD_IDENTITY_PRIVATE_KEY = before;
  }
}

const environmentKey = process.env.WORKLOAD_IDENTITY_PRIVATE_KEY;
const withoutEnvironmentKey = () => {
  beforeEach(() => {
    delete process.env.WORKLOAD_IDENTITY_PRIVATE_KEY;
  });
  afterEach(() => {
    if (environmentKey === undefined) delete process.env.WORKLOAD_IDENTITY_PRIVATE_KEY;
    else process.env.WORKLOAD_IDENTITY_PRIVATE_KEY = environmentKey;
  });
};

describe("Issuer", () => {
  withoutEnvironmentKey();

  test("signs a token the published key verifies", async () => {
    const issuer = await Issuer.create(url);
    const token = await issuer.sign({ aud: "https://service.example", sub: "thread:1" });
    const [header, payload] = token.split(".") as [string, string];

    expect(decode(header)).toMatchObject({
      alg: "ES256",
      typ: "JWT",
      kid: issuer.jwks().keys[0]!.kid,
    });
    expect(decode(payload)).toEqual({ iss: url, aud: "https://service.example", sub: "thread:1" });
    expect(await verify(token, issuer.jwks())).toBe(true);
  });

  test("a tampered token does not verify", async () => {
    const issuer = await Issuer.create(url);
    const [header, , signature] = (await issuer.sign({ sub: "thread:1" })).split(".");
    const forged = `${header}.${Buffer.from(JSON.stringify({ iss: url, sub: "organization:1" })).toString("base64url")}.${signature}`;

    expect(await verify(forged, issuer.jwks())).toBe(false);
  });

  test("a configured key keeps its key id across instances", async () => {
    const { pem, oneLine } = await makePem();

    const first = await Issuer.create(url, { privateKey: pem });
    const second = await Issuer.create(url, { privateKey: oneLine });

    expect(second.jwks()).toEqual(first.jwks());
    expect(await verify(await second.sign({ sub: "x" }), first.jwks())).toBe(true);
  });

  test("the discovery document points at the key set", async () => {
    const issuer = await Issuer.create(url);

    expect(issuer.discovery()).toMatchObject({
      issuer: url,
      jwks_uri: `${url}/jwks.json`,
      id_token_signing_alg_values_supported: ["ES256"],
    });
  });

  test("a key made for the process differs from another's", async () => {
    const [a, b] = await Promise.all([Issuer.create(url), Issuer.create(url)]);

    expect(a.jwks().keys[0]!.kid).not.toBe(b.jwks().keys[0]!.kid);
  });

  test("two issuers made from one store share the key it keeps", async () => {
    const { kept, store } = memoryStore();

    const first = await Issuer.create(url, { store });
    const second = await Issuer.create(url, { store });

    expect(kept.pem).toContain("BEGIN PRIVATE KEY");
    expect(second.jwks()).toEqual(first.jwks());
    expect(await verify(await second.sign({ sub: "thread:1" }), first.jwks())).toBe(true);
  });

  test("a configured key wins over the one the store keeps", async () => {
    const { pem, oneLine } = await makePem();
    const { kept, store } = memoryStore(pem);

    const issuer = await withEnvKey(oneLine, () => Issuer.create(url, { store }));
    const expected = await Issuer.create(url, { privateKey: pem });

    expect(kept.pem).toBe(pem);
    expect(issuer.jwks()).toEqual(expected.jwks());
  });
});

run("the kept signing key (real postgres)", () => {
  withoutEnvironmentKey();
  const keptRow = () => db.select().from(platformSettings).where(eq(platformSettings.key, setting));

  keepPlatformSettings([setting]);
  beforeAll(() => db.delete(platformSettings).where(eq(platformSettings.key, setting)));

  test("is made once, encrypted, and two issuers share its key id", async () => {
    const first = await Issuer.create(url, { store: workloadIdentityKeyStore });
    const second = await Issuer.create(url, { store: workloadIdentityKeyStore });

    expect(second.jwks()).toEqual(first.jwks());
    expect(await verify(await second.sign({ sub: "thread:1" }), first.jwks())).toBe(true);

    const [row] = await keptRow();
    expect(row!.value).not.toContain("BEGIN PRIVATE KEY");
    expect(await workloadIdentityKeyStore.load()).toContain("BEGIN PRIVATE KEY");
  });

  test("is put back after a restart, and a configured key still wins", async () => {
    const kept = await Issuer.create(url, { store: workloadIdentityKeyStore });
    const { pem, oneLine } = await makePem();

    const restarted = await Issuer.create(url, { store: workloadIdentityKeyStore });
    const configured = await withEnvKey(oneLine, () =>
      Issuer.create(url, { store: workloadIdentityKeyStore }),
    );

    expect(restarted.jwks()).toEqual(kept.jwks());
    expect(configured.jwks()).not.toEqual(kept.jwks());
    expect((await Issuer.create(url, { privateKey: pem })).jwks()).toEqual(configured.jwks());
    expect((await Issuer.create(url, { store: workloadIdentityKeyStore })).jwks()).toEqual(
      kept.jwks(),
    );
  });
});
