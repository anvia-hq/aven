const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;

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

export class Issuer {
  private constructor(
    readonly url: string,
    private key: CryptoKey,
    private publicJwk: PublicJwk,
  ) {}

  static async create(url: string, pem?: string) {
    const key = pem
      ? await crypto.subtle.importKey("pkcs8", pkcs8(pem), ALGORITHM, true, ["sign"])
      : (await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"])).privateKey;
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

export const issuer = await Issuer.create(
  `${origin.replace(/\/$/, "")}/api/workload-identity`,
  process.env.WORKLOAD_IDENTITY_PRIVATE_KEY || undefined,
);
