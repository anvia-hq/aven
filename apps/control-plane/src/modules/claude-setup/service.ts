import { db } from "@aven/db/client";
import { claudeSetupTokens } from "@aven/db/schema/claude-setup-tokens";
import { eq } from "drizzle-orm";

import { decryptOrUnavailable, encryptSecret } from "@aven/server-kit/crypto";
import { claudeTokenOf } from "./token";
import type { ClaudeSetupView } from "./types";

const hintOf = (token: string) => token.slice(-4);

const UNREADABLE = {
  logged: "Could not read a Claude setup token",
  message: "The Claude setup token could not be read; set it again in Settings",
};

export const claudeSetupService = {
  async view(userId: string): Promise<ClaudeSetupView> {
    const [row] = await db
      .select({ tokenHint: claudeSetupTokens.tokenHint })
      .from(claudeSetupTokens)
      .where(eq(claudeSetupTokens.userId, userId));

    if (!row) return { configured: false, hint: null };

    return { configured: true, hint: row.tokenHint };
  },

  async tokenFor(userId: string) {
    const [row] = await db
      .select({ tokenEncrypted: claudeSetupTokens.tokenEncrypted })
      .from(claudeSetupTokens)
      .where(eq(claudeSetupTokens.userId, userId));

    if (!row) return undefined;

    return decryptOrUnavailable(row.tokenEncrypted, UNREADABLE);
  },

  requireFor(userId: string) {
    return claudeTokenOf(userId, (id) => this.tokenFor(id));
  },

  async save(userId: string, token: string): Promise<ClaudeSetupView> {
    const tokenEncrypted = encryptSecret(token);
    const tokenHint = hintOf(token);
    await db
      .insert(claudeSetupTokens)
      .values({ userId, tokenEncrypted, tokenHint })
      .onConflictDoUpdate({
        target: claudeSetupTokens.userId,
        set: { tokenEncrypted, tokenHint, updatedAt: new Date() },
      });
    return { configured: true, hint: tokenHint };
  },

  async remove(userId: string) {
    const removed = await db
      .delete(claudeSetupTokens)
      .where(eq(claudeSetupTokens.userId, userId))
      .returning({ id: claudeSetupTokens.id });
    return removed.length > 0;
  },
};
