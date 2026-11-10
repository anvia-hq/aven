import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import type { BrowserClaims, BrowserTokenKind } from "./types";

const payload = z.object({
  k: z.enum(["ticket", "page"]),
  organizationId: z.string().min(1),
  threadId: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  exp: z.number(),
});

const signature = (secret: Uint8Array, body: string) =>
  createHmac("sha256", secret).update(body).digest("base64url");

export function signBrowserToken(
  secret: Uint8Array,
  kind: BrowserTokenKind,
  claims: BrowserClaims,
  ttlMs: number,
  now = Date.now(),
) {
  const body = Buffer.from(JSON.stringify({ k: kind, ...claims, exp: now + ttlMs })).toString(
    "base64url",
  );
  return `${body}.${signature(secret, body)}`;
}

export function verifyBrowserToken(
  secret: Uint8Array,
  kind: BrowserTokenKind,
  token: string,
  now = Date.now(),
): BrowserClaims | null {
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
  return { organizationId: parsed.organizationId, threadId: parsed.threadId, port: parsed.port };
}
