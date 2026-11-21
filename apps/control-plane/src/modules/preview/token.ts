import { signHmacJson, verifyHmacJson } from "@aven/server-kit/tokens";
import { z } from "zod";

import type { PreviewClaims, PreviewTokenKind } from "./types";

const payload = z.object({
  k: z.enum(["ticket", "page", "embed"]),
  runtimeId: z.string().min(1).max(100),
  port: z.number().int().min(1).max(65535),
  exp: z.number(),
});

export function signPreviewToken(
  secret: Uint8Array,
  kind: PreviewTokenKind,
  claims: PreviewClaims,
  ttlMs: number,
  now = Date.now(),
) {
  return signHmacJson(secret, {
    k: kind,
    runtimeId: claims.runtimeId,
    port: claims.port,
    exp: now + ttlMs,
  });
}

export function verifyPreviewToken(
  secret: Uint8Array,
  kind: PreviewTokenKind,
  token: string,
  now = Date.now(),
): { claims: PreviewClaims; expiresAt: number } | null {
  const raw = verifyHmacJson(secret, token);

  if (raw === null) return null;

  const parsed = payload.safeParse(raw);

  if (!parsed.success || parsed.data.k !== kind || parsed.data.exp <= now) return null;

  return {
    claims: { runtimeId: parsed.data.runtimeId, port: parsed.data.port },
    expiresAt: parsed.data.exp,
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
