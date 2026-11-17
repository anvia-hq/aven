import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { eq } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "@aven/server-kit/crypto";
import { githubUrlsFromEnv } from "./app-manifest";
import type { GithubUrls } from "./types";
import type { GithubConfig } from "@aven/github/types";

const KEY = "github_app";

type Stored = Pick<GithubConfig, "appId" | "privateKey" | "slug" | "clientId" | "clientSecret">;

const seal = (config: GithubConfig) => {
  const stored: Stored = {
    appId: config.appId,
    privateKey: config.privateKey,
    slug: config.slug,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  };
  return encryptSecret(JSON.stringify(stored));
};

const unseal = (value: string, urls: GithubUrls): GithubConfig => ({
  ...(JSON.parse(decryptSecret(value)) as Stored),
  ...urls,
});

export async function saveGithubApp(config: GithubConfig) {
  const value = seal(config);
  await db
    .insert(platformSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value } });
}

export async function loadGithubApp(
  urls: GithubUrls = githubUrlsFromEnv(),
): Promise<GithubConfig | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, KEY));

  if (!row) return null;

  try {
    return unseal(row.value, urls);
  } catch (error) {
    console.error("The stored GitHub App cannot be read; it has to be created again.", error);
    return null;
  }
}

export async function useStoredGithubApp(client: {
  configured: boolean;
  configure: (config: GithubConfig | null) => void;
}) {
  if (client.configured) return;

  const stored = await loadGithubApp();

  if (stored) client.configure(stored);
}
