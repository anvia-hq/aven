import { db } from "@aven/db/client";
import { codexSetupTokens } from "@aven/db/schema/codex-setup-tokens";
import { eq } from "drizzle-orm";

import { decryptOrUnavailable, encryptSecret } from "@aven/server-kit/crypto";
import { codexTokenOf } from "./token";
import type { CodexSetupView } from "./types";

const hintOf = (token: string) => token.slice(-4);

const UNREADABLE = {
  logged: "Could not read a Codex API key",
  message: "The Codex API key could not be read; set it again in Settings",
};

export const codexSetupService = {
  async view(userId: string): Promise<CodexSetupView> {
    const [row] = await db
      .select({ tokenHint: codexSetupTokens.tokenHint })
      .from(codexSetupTokens)
      .where(eq(codexSetupTokens.userId, userId));

    if (!row) return { configured: false, hint: null };

    return { configured: true, hint: row.tokenHint };
  },

  async tokenFor(userId: string) {
    const [row] = await db
      .select({ tokenEncrypted: codexSetupTokens.tokenEncrypted })
      .from(codexSetupTokens)
      .where(eq(codexSetupTokens.userId, userId));

    if (!row) return undefined;

    return decryptOrUnavailable(row.tokenEncrypted, UNREADABLE);
  },

  requireFor(userId: string) {
    return codexTokenOf(userId, (id) => this.tokenFor(id));
  },

  async save(userId: string, token: string): Promise<CodexSetupView> {
    const tokenEncrypted = encryptSecret(token);
    const tokenHint = hintOf(token);
    await db
      .insert(codexSetupTokens)
      .values({ userId, tokenEncrypted, tokenHint })
      .onConflictDoUpdate({
        target: codexSetupTokens.userId,
        set: { tokenEncrypted, tokenHint, updatedAt: new Date() },
      });
    return { configured: true, hint: tokenHint };
  },

  async remove(userId: string) {
    const removed = await db
      .delete(codexSetupTokens)
      .where(eq(codexSetupTokens.userId, userId))
      .returning({ id: codexSetupTokens.id });
    return removed.length > 0;
  },
};
