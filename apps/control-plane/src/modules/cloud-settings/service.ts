import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { setSandboxSettings } from "@aven/sandbox/settings";
import type { SandboxSettings } from "@aven/sandbox/settings";
import { eq } from "drizzle-orm";

import { decryptOrUnavailable, encryptSecret } from "@aven/server-kit/crypto";
import { NotFoundError, UnprocessableError } from "@aven/server-kit/errors";
import { runtimesService } from "../runtimes/service";
import type { SaveCloudSettingsBody } from "./schema";
import { storedCloudSettings } from "./schema";
import type { CloudSettingsView, StoredCloudSettings } from "./types";

const KEY = "spaces_settings";

function addressOf(value: string, label: string) {
  const raw = value.trim().replace(/\/$/, "");

  try {
    const url = new URL(raw);

    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("scheme");
  } catch {
    throw new UnprocessableError(`${label} must be an http or https address`);
  }

  return raw;
}

function keyOf(stored: StoredCloudSettings) {
  return decryptOrUnavailable(stored.apiKeyEncrypted, {
    logged: "Could not decrypt the saved Aven Cloud sandbox key:",
    message: "The saved Aven Cloud sandbox key could not be read; enter it again",
  });
}

async function readStored(): Promise<StoredCloudSettings | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, KEY));

  if (!row) return null;

  try {
    const parsed = storedCloudSettings.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : null;
  } catch {
    console.error(`The saved Aven Cloud sandbox is not a readable value (${KEY})`);
    return null;
  }
}

function settingsOf(stored: StoredCloudSettings | null): SandboxSettings | null {
  if (!stored) return null;

  try {
    return {
      provider: stored.provider,
      base: stored.base,
      apiKey: keyOf(stored),
      runnerUrl: stored.runnerUrl,
    };
  } catch (error) {
    console.error(
      "Could not read the saved Aven Cloud sandbox settings:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

const optionalAddress = (value: string, label: string) =>
  value === "" ? "" : addressOf(value, label);

export const cloudSettingsService = {
  async view(): Promise<CloudSettingsView | null> {
    const stored = await readStored();

    return stored
      ? {
          provider: stored.provider,
          base: stored.base,
          runnerUrl: stored.runnerUrl,
          keyHint: stored.keyHint,
        }
      : null;
  },

  async save(body: SaveCloudSettingsBody) {
    const existing = await readStored();
    const sameProvider = existing?.provider === body.provider;
    const apiKey = body.apiKey || (existing && sameProvider ? keyOf(existing) : "");

    if (!apiKey) throw new UnprocessableError("Enter the sandbox provider's API key");

    const base =
      body.provider === "spaces"
        ? addressOf(body.base, "The spaces server's address")
        : optionalAddress(body.base, "The boat API address");

    const value = JSON.stringify({
      provider: body.provider,
      base,
      runnerUrl: optionalAddress(body.runnerUrl, "The address a sandbox dials"),
      apiKeyEncrypted: body.apiKey ? encryptSecret(body.apiKey) : (existing?.apiKeyEncrypted ?? ""),
      keyHint: body.apiKey ? body.apiKey.slice(-4) : (existing?.keyHint ?? ""),
    });

    await db
      .insert(platformSettings)
      .values({ key: KEY, value })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { value, updatedAt: new Date() },
      });

    await this.apply();
    await runtimesService.ensureCloud();
    return this.view();
  },

  async remove() {
    const removed = await db
      .delete(platformSettings)
      .where(eq(platformSettings.key, KEY))
      .returning({ key: platformSettings.key });

    if (removed.length === 0) throw new NotFoundError("No Aven Cloud sandbox is saved here");

    await this.apply();
  },

  async apply() {
    setSandboxSettings(settingsOf(await readStored()));
  },
};
