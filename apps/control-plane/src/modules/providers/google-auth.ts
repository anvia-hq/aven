import { createHash, createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const RENEW_BEFORE_MS = 5 * 60 * 1000;

export class GoogleAuthError extends Error {}

type ServiceAccount = { client_email: string; private_key: string; private_key_id?: string };

export function parseServiceAccount(credential: string): ServiceAccount | null {
  if (!credential.trimStart().startsWith("{")) return null;
  try {
    const json = JSON.parse(credential) as Record<string, unknown>;
    if (
      json.type === "service_account" &&
      typeof json.client_email === "string" &&
      typeof json.private_key === "string"
    ) {
      return {
        client_email: json.client_email,
        private_key: json.private_key,
        private_key_id: typeof json.private_key_id === "string" ? json.private_key_id : undefined,
      };
    }
  } catch {}
  return null;
}

export const isGoogleCredential = (credential: string) =>
  parseServiceAccount(credential) !== null ||
  (!credential.trimStart().startsWith("{") && !/\s/.test(credential.trim()));

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

function signedAssertion(account: ServiceAccount, nowMs: number) {
  const issuedAt = Math.floor(nowMs / 1000);
  const unsigned = [
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: account.private_key_id })),
    base64url(
      JSON.stringify({
        iss: account.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + 3600,
      }),
    ),
  ].join(".");
  try {
    const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key);
    return `${unsigned}.${base64url(signature)}`;
  } catch {
    throw new GoogleAuthError("The service account's private key could not be read");
  }
}

type Minted = { token: string; expiresAt: number };

export function createGoogleTokens(fetchFn: typeof fetch = fetch, now: () => number = Date.now) {
  const minted = new Map<string, Minted>();
  const pending = new Map<string, Promise<Minted>>();

  async function exchange(account: ServiceAccount): Promise<Minted> {
    const started = now();
    let res: Response;
    try {
      res = await fetchFn(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: signedAssertion(account, started),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      if (error instanceof GoogleAuthError) throw error;
      throw new GoogleAuthError("Could not reach Google to sign the service account in");
    }
    if (!res.ok) {
      throw new GoogleAuthError(`Google refused the service account key (${res.status})`);
    }
    const body = (await res.json().catch(() => null)) as {
      access_token?: unknown;
      expires_in?: unknown;
    } | null;
    if (typeof body?.access_token !== "string") {
      throw new GoogleAuthError("Google answered with no access token");
    }
    const seconds = typeof body.expires_in === "number" ? body.expires_in : 3600;
    return { token: body.access_token, expiresAt: started + seconds * 1000 };
  }

  return async function accessToken(credential: string) {
    const account = parseServiceAccount(credential);
    if (!account) return credential.trim();
    const id = createHash("sha256").update(credential).digest("hex");
    const have = minted.get(id);
    if (have && have.expiresAt - RENEW_BEFORE_MS > now()) return have.token;
    let inFlight = pending.get(id);
    if (!inFlight) {
      inFlight = exchange(account)
        .then((next) => {
          minted.set(id, next);
          return next;
        })
        .finally(() => pending.delete(id));
      pending.set(id, inFlight);
    }
    return (await inFlight).token;
  };
}

export const googleAccessToken = createGoogleTokens();
