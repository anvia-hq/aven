import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { OpaqueToken } from "./types";

const BEARER = /^Bearer\s+(\S+)$/i;

export function bearerToken(source: Headers | string | null | undefined) {
  const header = source instanceof Headers ? source.get("authorization") : source;
  return BEARER.exec(header?.trim() ?? "")?.[1];
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function issueOpaqueToken(prefix: string): OpaqueToken {
  const token = `${prefix}${randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashOpaqueToken(token), tokenHint: token.slice(-4) };
}

export function verifyOpaqueTokenHash(token: string, storedHexHash: string) {
  const given = Buffer.from(hashOpaqueToken(token), "hex");
  const kept = Buffer.from(storedHexHash, "hex");
  return given.length === kept.length && timingSafeEqual(given, kept);
}

export function sameOpaqueToken(a: string, b: string) {
  return timingSafeEqual(Buffer.from(hashOpaqueToken(a)), Buffer.from(hashOpaqueToken(b)));
}

function hmacSignature(secret: string | Uint8Array, body: string, purpose?: string) {
  const data = purpose ? `${purpose}:${body}` : body;
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signHmacJson(secret: string | Uint8Array, payload: unknown, purpose?: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmacSignature(secret, body, purpose)}`;
}

export function verifyHmacJson(
  secret: string | Uint8Array,
  token: string,
  purpose?: string,
): unknown | null {
  const [body, given, extra] = token.split(".");

  if (!body || !given || extra !== undefined) return null;

  const expected = Buffer.from(hmacSignature(secret, body, purpose));
  const actual = Buffer.from(given);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as unknown;
  } catch {
    return null;
  }
}
