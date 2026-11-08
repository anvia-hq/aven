import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { eq } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "../../crypto";
import type { IssuerKeyStore, IssuerOptions } from "./types";

const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const SETTING_KEY = "workload_identity_private_key";

type PublicJwk = {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  kid: string;
  alg: "ES256";
  use: "sig";
};

const encoder = new TextEncoder();
const base64url = (data: string | ArrayBuffer) =>
  Buffer.from(typeof data === "string" ? data : new Uint8Array(data)).toString("base64url");

function pkcs8(pem: string) {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return Buffer.from(body, "base64");
}

async function thumbprint(jwk: { crv?: string; x?: string; y?: string }) {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: "EC", x: jwk.x, y: jwk.y });
  return base64url(await crypto.subtle.digest("SHA-256", encoder.encode(canonical)));
}

const importPem = (pem: string) =>
  crypto.subtle.importKey("pkcs8", pkcs8(pem), ALGORITHM, true, ["sign"]);

const makeKey = async () =>
  (await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"])).privateKey;

async function pemOf(key: CryptoKey) {
  const body = Buffer.from(await crypto.subtle.exportKey("pkcs8", key)).toString("base64");
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
}

async function signingKey({ privateKey, store }: IssuerOptions) {
  const configured = (privateKey ?? process.env.WORKLOAD_IDENTITY_PRIVATE_KEY)?.trim();
  if (configured) return importPem(configured);
  if (!store) return makeKey();
  const stored = await store.load();
  if (stored) return importPem(stored);
  return importPem(await store.save(await pemOf(await makeKey())));
}

async function storedValue() {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, SETTING_KEY));
  return row?.value ?? null;
}

function decryptOrNull(value: string | null) {
  if (value === null) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

async function readStored() {
  const value = await storedValue();
  const pem = decryptOrNull(value);
  if (value !== null && pem === null) {
    console.error("The stored workload identity key cannot be read; a new one is made.");
  }
  return pem;
}

export const workloadIdentityKeyStore: IssuerKeyStore = {
  load: readStored,

  async save(pem: string) {
    const value = encryptSecret(pem);
    const [made] = await db
      .insert(platformSettings)
      .values({ key: SETTING_KEY, value })
      .onConflictDoNothing({ target: platformSettings.key })
      .returning({ key: platformSettings.key });
    if (made) return pem;
    const kept = decryptOrNull(await storedValue());
    if (kept) return kept;
    await db.update(platformSettings).set({ value }).where(eq(platformSettings.key, SETTING_KEY));
    return pem;
  },
};

export class Issuer {
  private constructor(
    readonly url: string,
    private key: CryptoKey,
    private publicJwk: PublicJwk,
  ) {}

  static async create(url: string, options: IssuerOptions = {}) {
    const key = await signingKey(options);
    const { d: _private, ...jwk } = await crypto.subtle.exportKey("jwk", key);
    const publicJwk: PublicJwk = {
      kty: "EC",
      crv: "P-256",
      x: jwk.x!,
      y: jwk.y!,
      kid: await thumbprint(jwk),
      alg: "ES256",
      use: "sig",
    };
    return new Issuer(url, key, publicJwk);
  }

  jwks() {
    return { keys: [this.publicJwk] };
  }

  discovery() {
    return {
      issuer: this.url,
      jwks_uri: `${this.url}/jwks.json`,
      response_types_supported: ["id_token"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
    };
  }

  async sign(claims: Record<string, unknown>) {
    const header = base64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: this.publicJwk.kid }));
    const payload = base64url(JSON.stringify({ iss: this.url, ...claims }));
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      this.key,
      encoder.encode(`${header}.${payload}`),
    );
    return `${header}.${payload}.${base64url(signature)}`;
  }
}

const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:5173";

export const issuer = await Issuer.create(`${origin.replace(/\/$/, "")}/api/workload-identity`, {
  store: workloadIdentityKeyStore,
});
