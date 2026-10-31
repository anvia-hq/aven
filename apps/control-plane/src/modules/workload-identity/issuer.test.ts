import { describe, expect, test } from "bun:test";

import { Issuer } from "./issuer";

const url = "https://aven.example/api/workload-identity";
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

describe("Issuer", () => {
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
    const { privateKey } = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64");
    const pem = `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----`;
    const oneLine = pem.replaceAll("\n", "\\n");

    const first = await Issuer.create(url, pem);
    const second = await Issuer.create(url, oneLine);

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
});
