import { createHash, randomBytes, randomUUID } from "node:crypto";

import { db } from "@aven/db/client";
import { sessions } from "@aven/db/schema/sessions";
import { users } from "@aven/db/schema/users";
import { verifications } from "@aven/db/schema/verifications";
import { and, eq, gt, like, lte } from "drizzle-orm";

import { authService, ensurePersonalOrganization } from "../auth/service";
import { storedPairingValue } from "./schema";
import type { ExchangedSession, PairingClientMeta, PairingCode } from "./types";

const PREFIX = "mobile-pair:";
const PAIRING_TTL_MS = 2 * 60 * 1000;
const MOBILE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function identifierOf(code: string) {
  return `${PREFIX}${hashCode(code)}`;
}

export const mobilePairService = {
  async create(userId: string, organizationId: string): Promise<PairingCode> {
    const now = new Date();
    const code = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);

    await db
      .delete(verifications)
      .where(and(like(verifications.identifier, `${PREFIX}%`), lte(verifications.expiresAt, now)));

    await db.insert(verifications).values({
      id: randomUUID(),
      identifier: identifierOf(code),
      value: JSON.stringify({ userId, organizationId }),
      expiresAt,
    });

    return { code, expiresAt: expiresAt.toISOString() };
  },

  async exchange(code: string, meta: PairingClientMeta): Promise<ExchangedSession | null> {
    const now = new Date();
    const [consumed] = await db
      .delete(verifications)
      .where(
        and(eq(verifications.identifier, identifierOf(code)), gt(verifications.expiresAt, now)),
      )
      .returning({ value: verifications.value });

    if (!consumed) return null;

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(consumed.value);
    } catch {
      return null;
    }

    const parsed = storedPairingValue.safeParse(rawPayload);

    if (!parsed.success) return null;

    const { userId, organizationId } = parsed.data;
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return null;

    const activeOrganizationId = (await authService.isMember(userId, organizationId))
      ? organizationId
      : await ensurePersonalOrganization(userId);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + MOBILE_SESSION_TTL_MS);

    await db.insert(sessions).values({
      id: randomUUID(),
      token,
      userId,
      activeOrganizationId,
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { token, expiresAt: expiresAt.toISOString() };
  },
};
