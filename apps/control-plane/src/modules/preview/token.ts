import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import type { PreviewClaims, PreviewTokenKind } from "./types";

const payload = z.object({
  k: z.enum(["ticket", "page", "embed"]),
  runtimeId: z.string().min(1).max(100),
  port: z.number().int().min(1).max(65535),
  exp: z.number(),
});

const signature = (secret: Uint8Array, body: string) =>
  createHmac("sha256", secret).update(body).digest("base64url");

export function signPreviewToken(
  secret: Uint8Array,
  kind: PreviewTokenKind,
  claims: PreviewClaims,
  ttlMs: number,
  now = Date.now(),
) {
  const body = Buffer.from(
    JSON.stringify({ k: kind, runtimeId: claims.runtimeId, port: claims.port, exp: now + ttlMs }),
  ).toString("base64url");
  return `${body}.${signature(secret, body)}`;
}

export function verifyPreviewToken(
  secret: Uint8Array,
  kind: PreviewTokenKind,
  token: string,
  now = Date.now(),
): { claims: PreviewClaims; expiresAt: number } | null {
  const [body, given, extra] = token.split(".");

  if (!body || !given || extra !== undefined) return null;

  const expected = Buffer.from(signature(secret, body));
  const actual = Buffer.from(given);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let parsed: z.infer<typeof payload>;

  try {
    parsed = payload.parse(JSON.parse(Buffer.from(body, "base64url").toString()));
  } catch {
    return null;
  }

  if (parsed.k !== kind || parsed.exp <= now) return null;

  return {
    claims: { runtimeId: parsed.runtimeId, port: parsed.port },
    expiresAt: parsed.exp,
  };
}

export class SpentTickets {
  #spent = new Map<string, number>();

  spend(token: string, expiresAt: number, now = Date.now()) {
    for (const [used, expiry] of this.#spent) {
      if (expiry <= now) this.#spent.delete(used);
    }

    if (this.#spent.has(token)) return false;

    this.#spent.set(token, expiresAt);
    return true;
  }
}

export function sameClaims(a: PreviewClaims, b: PreviewClaims) {
  return a.runtimeId === b.runtimeId && a.port === b.port;
}
