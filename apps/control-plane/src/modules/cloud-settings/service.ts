import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { offerCloudProviders } from "@aven/sandbox/cloud-config";
import { setSpacesSettings, spacesRunnerUrl } from "@aven/sandbox/spaces/config";
import { eq } from "drizzle-orm";

import { decryptOrUnavailable, encryptSecret } from "@aven/server-kit/crypto";
import { ConflictError, NotFoundError, UnprocessableError } from "@aven/server-kit/errors";
import type { SaveCloudSettingsBody } from "./schema";
import { storedCloudSettings } from "./schema";
import type { CloudSettingsView, StoredCloudSettings } from "./types";

const KEY = "spaces_settings";

const ENV = ["AVEN_SPACES_API_BASE", "AVEN_SPACES_API_KEY", "AVEN_SPACES_RUNNER_URL"] as const;

type Env = Record<string, string | undefined>;

function addressOf(value: string, label: string) {
  const raw = value.trim().replace(/\/$/, "");

  try {
    const url = new URL(raw);

    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("scheme");
  } catch {
    throw new UnprocessableError(
      `${label} must be an http or https address, for example https://spaces.example.com/api/v1`,
    );
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

  const parsed = storedCloudSettings.safeParse(JSON.parse(row.value));
  return parsed.success ? parsed.data : null;
}

function fromEnv(env: Env): CloudSettingsView | null {
  const base = env.AVEN_SPACES_API_BASE?.trim();
  const apiKey = env.AVEN_SPACES_API_KEY?.trim();

  if (!base || !apiKey) return null;

  return {
    provider: "spaces",
    base: addressOf(base, "AVEN_SPACES_API_BASE"),
    runnerUrl: spacesRunnerUrl({
      AVEN_SPACES_RUNNER_URL: env.AVEN_SPACES_RUNNER_URL,
      BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    }),
    keyHint: "",
    source: "env",
  };
}

function refuseWhenEnv(env: Env) {
  const named = ENV.find((name) => env[name]?.trim());

  if (named) {
    throw new ConflictError(
      `The Aven Cloud sandbox is set by ${named} in the server's environment. Remove it there to manage it here`,
    );
  }
}

export const cloudSettingsService = {
  async view(env: Env = process.env): Promise<CloudSettingsView | null> {
    const inherited = fromEnv(env);

    if (inherited) return inherited;

    const stored = await readStored();

    return stored
      ? {
          provider: "spaces",
          base: stored.base,
          runnerUrl: stored.runnerUrl,
          keyHint: stored.keyHint,
          source: "platform",
        }
      : null;
  },

  async save(body: SaveCloudSettingsBody, env: Env = process.env) {
    refuseWhenEnv(env);
    const existing = await readStored();
    const apiKey = body.apiKey || (existing ? keyOf(existing) : "");

    if (!apiKey) throw new UnprocessableError("Enter the sandbox server's API key");

    const value = JSON.stringify({
      base: addressOf(body.base, "The sandbox server's address"),
      runnerUrl: addressOf(body.runnerUrl, "The address a sandbox dials"),
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
    return this.view(env);
  },

  async remove(env: Env = process.env) {
    refuseWhenEnv(env);
    const removed = await db
      .delete(platformSettings)
      .where(eq(platformSettings.key, KEY))
      .returning({ key: platformSettings.key });

    if (removed.length === 0) throw new NotFoundError("No Aven Cloud sandbox is saved here");

    await this.apply();
  },

  async apply() {
    const stored = await readStored();

    setSpacesSettings(
      stored ? { base: stored.base, apiKey: keyOf(stored), runnerUrl: stored.runnerUrl } : null,
    );
    offerCloudProviders(stored ? ["spaces"] : []);
  },
};
