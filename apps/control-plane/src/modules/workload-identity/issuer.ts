// The control plane as an OIDC issuer (decision 0049): an ES256 key, the JWKS and discovery
// document a provider fetches to trust it, and the signing of a token. Plain WebCrypto, no JWT
// library: a JWS here is three base64url parts and the signature WebCrypto returns is already the
// raw r||s form JWS wants.

const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;

export type PublicJwk = {
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

// The PEM may be one line with literal `\n`, as the GitHub App's key is (`.env` cannot hold newlines).
function pkcs8(pem: string) {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return Buffer.from(body, "base64");
}

// The key id is the JWK thumbprint (RFC 7638), so a rotated key is a new `kid` by construction.
async function thumbprint(jwk: { crv?: string; x?: string; y?: string }) {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: "EC", x: jwk.x, y: jwk.y });
  return base64url(await crypto.subtle.digest("SHA-256", encoder.encode(canonical)));
}

export class Issuer {
  private constructor(
    /** The `iss` claim and the base of the discovery document. */
    readonly url: string,
    private key: CryptoKey,
    private publicJwk: PublicJwk,
  ) {}

  /**
   * Without a configured key one is made for this process: tokens stop verifying across a restart,
   * which is fine until a provider is set up against the issuer.
   */
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

  /** A signed JWT: `iss` and `kid` are the issuer's own, the rest are the claims given. */
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

// The platform's `/api` proxy strips its prefix, so the control plane serves this at `/workload-identity`.
export const issuer = await Issuer.create(
  `${origin.replace(/\/$/, "")}/api/workload-identity`,
  process.env.WORKLOAD_IDENTITY_PRIVATE_KEY || undefined,
);
