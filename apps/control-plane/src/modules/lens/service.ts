import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { eq } from "drizzle-orm";

import type { RunLens } from "@aven/protocol/types";
import { decryptOrUnavailable, encryptSecret } from "@aven/server-kit/crypto";
import { NotFoundError, UnprocessableError } from "@aven/server-kit/errors";
import { lensEnabled } from "./flag";
import type { SaveLensBody } from "./schema";
import { storedLensSettings } from "./schema";
import type { LensSettingsView, StoredLensSettings } from "./types";

const KEY = "lens_settings";

function addressOf(value: string) {
  const raw = value.trim().replace(/\/$/, "");

  try {
    const url = new URL(raw);

    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("scheme");

    if (url.search !== "" || url.hash !== "") throw new Error("query");
  } catch {
    throw new UnprocessableError("The Lens address must be a plain http or https address");
  }

  return raw;
}

function keyOf(stored: StoredLensSettings) {
  return decryptOrUnavailable(stored.secretKeyEncrypted, {
    logged: "Could not decrypt the saved Anvia Lens secret key:",
    message: "The saved Anvia Lens secret key could not be read; enter it again",
  });
}

async function readStored(): Promise<StoredLensSettings | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, KEY));

  if (!row) return null;

  try {
    const parsed = storedLensSettings.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : null;
  } catch {
    console.error(`The saved Anvia Lens settings are not a readable value (${KEY})`);
    return null;
  }
}

function viewOf(stored: StoredLensSettings): LensSettingsView {
  return {
    baseUrl: stored.baseUrl,
    publicKey: stored.publicKey,
    keyHint: stored.keyHint,
    captureMode: stored.captureMode,
  };
}

export const lensSettingsService = {
  async view(): Promise<LensSettingsView | null> {
    const stored = await readStored();
    return stored ? viewOf(stored) : null;
  },

  async save(body: SaveLensBody) {
    const existing = await readStored();

    if (!body.secretKey && !existing) {
      throw new UnprocessableError("Enter the secret key of Anvia Lens");
    }

    const stored: StoredLensSettings = {
      baseUrl: addressOf(body.baseUrl),
      publicKey: body.publicKey,
      secretKeyEncrypted: body.secretKey
        ? encryptSecret(body.secretKey)
        : (existing?.secretKeyEncrypted ?? ""),
      keyHint: body.secretKey ? body.secretKey.slice(-4) : (existing?.keyHint ?? ""),
      captureMode: body.captureMode,
    };
    const value = JSON.stringify(stored);

    await db
      .insert(platformSettings)
      .values({ key: KEY, value })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });

    return viewOf(stored);
  },

  async remove() {
    const removed = await db
      .delete(platformSettings)
      .where(eq(platformSettings.key, KEY))
      .returning({ key: platformSettings.key });

    if (removed.length === 0) throw new NotFoundError("No Anvia Lens settings are saved here");
  },

  async forRun(): Promise<RunLens | undefined> {
    if (!lensEnabled()) return undefined;

    const stored = await readStored();

    if (!stored) return undefined;

    try {
      return {
        baseUrl: stored.baseUrl,
        publicKey: stored.publicKey,
        secretKey: keyOf(stored),
        captureMode: stored.captureMode,
      };
    } catch (error) {
      console.error(
        "Could not read the saved Anvia Lens settings:",
        error instanceof Error ? error.message : error,
      );
      return undefined;
    }
  },
};
