import { db } from "@aven/db/client";
import { codexLogins } from "@aven/db/schema/codex-logins";
import { eq } from "drizzle-orm";

import { CODEX_LOGIN_MISSING, codexAccessToken } from "@aven/protocol/codex-login";

import { decryptOrUnavailable, encryptSecret } from "../../crypto";
import { UnprocessableError } from "../../errors";
import type { SaveCodexLoginBody } from "./schema";
import type { CodexLoginView } from "./types";

export class CodexLoginMissingError extends UnprocessableError {
  constructor() {
    super(CODEX_LOGIN_MISSING);
  }
}

async function rowOf(userId: string) {
  const [row] = await db.select().from(codexLogins).where(eq(codexLogins.userId, userId));
  return row;
}

function viewOf(hint: string | undefined): CodexLoginView {
  return hint ? { configured: true, hint } : { configured: false };
}

export const codexSetupService = {
  async view(userId: string): Promise<CodexLoginView> {
    const row = await rowOf(userId);
    return viewOf(row?.hint);
  },

  async save(userId: string, { login }: SaveCodexLoginBody): Promise<CodexLoginView> {
    const token = codexAccessToken(login);

    if (!token)
      throw new UnprocessableError(
        "Paste a ChatGPT access token, or a Codex auth.json with an access_token",
      );

    const values = { loginEncrypted: encryptSecret(login), hint: token.slice(-4) };
    const [saved] = await db
      .insert(codexLogins)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: codexLogins.userId, set: values })
      .returning({ hint: codexLogins.hint });

    if (!saved) throw new UnprocessableError("The ChatGPT login could not be saved");

    return viewOf(saved.hint);
  },

  async remove(userId: string) {
    const removed = await db
      .delete(codexLogins)
      .where(eq(codexLogins.userId, userId))
      .returning({ id: codexLogins.id });
    return removed.length > 0;
  },

  async requireFor(userId: string) {
    const row = await rowOf(userId);

    if (!row) throw new CodexLoginMissingError();

    return decryptOrUnavailable(row.loginEncrypted, {
      logged: "Could not decrypt a ChatGPT login:",
      message: "The saved ChatGPT login could not be read. Save it again in Settings.",
    });
  },
};
