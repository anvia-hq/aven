import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { eq } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "../../crypto";
import type { GithubConfig } from "./client";
import { githubUrlsFromEnv, type GithubUrls } from "./app-manifest";

const KEY = "github_app";

type Stored = Pick<GithubConfig, "appId" | "privateKey" | "slug" | "clientId" | "clientSecret">;

/** Keeps the app a platform owner created (decision 0074), encrypted with the providers' key. */
export async function saveGithubApp(config: GithubConfig) {
  const stored: Stored = {
    appId: config.appId,
    privateKey: config.privateKey,
    slug: config.slug,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  };
  const value = encryptSecret(JSON.stringify(stored));
  await db
    .insert(platformSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value } });
}

/** The kept app, or null when there is none or it cannot be read (the key changed: it has to be created again). */
export async function loadGithubApp(
  urls: GithubUrls = githubUrlsFromEnv(),
): Promise<GithubConfig | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, KEY));
  if (!row) return null;
  try {
    return { ...(JSON.parse(decryptSecret(row.value)) as Stored), ...urls };
  } catch (error) {
    console.error("The stored GitHub App cannot be read; it has to be created again.", error);
    return null;
  }
}

/** At start: an app set in the environment is used as it is, otherwise the one that was kept. */
export async function useStoredGithubApp(client: {
  configured: boolean;
  configure: (config: GithubConfig | null) => void;
}) {
  if (client.configured) return;
  const stored = await loadGithubApp();
  if (stored) client.configure(stored);
}
