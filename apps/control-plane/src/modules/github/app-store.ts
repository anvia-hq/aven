import { db } from "@aven/db/client";
import { githubApps } from "@aven/db/schema/github-apps";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { eq } from "drizzle-orm";

import { decryptSecret, encryptSecret } from "../../crypto";
import { ConflictError } from "../../errors";
import type { GithubConfig } from "./client";
import { githubUrlsFromEnv, type GithubUrls } from "./app-manifest";

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

/** Keeps the app a platform owner created (decision 0074), encrypted with the providers' key. */
export async function saveGithubApp(config: GithubConfig) {
  const value = seal(config);
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
    return unseal(row.value, urls);
  } catch (error) {
    console.error("The stored GitHub App cannot be read; it has to be created again.", error);
    return null;
  }
}

/**
 * Keeps the app a workspace made for itself and returns its id (decision 0123). A workspace has
 * one: a second one, as when two callbacks arrive together, is refused rather than replacing the
 * first, which installations and people's connections already belong to.
 */
export async function saveOrganizationApp(
  organizationId: string,
  userId: string,
  config: GithubConfig,
) {
  const [row] = await db
    .insert(githubApps)
    .values({
      organizationId,
      createdBy: userId,
      slug: config.slug,
      credentialsEncrypted: seal(config),
    })
    .onConflictDoNothing({ target: githubApps.organizationId })
    .returning({ id: githubApps.id });
  if (!row) throw new ConflictError("This workspace already has its own GitHub App");
  return row.id;
}

/** A workspace's own app and its id, or null when it has none or it cannot be read. */
export async function loadOrganizationApp(
  organizationId: string,
  urls: GithubUrls = githubUrlsFromEnv(),
): Promise<{ id: string; config: GithubConfig } | null> {
  const [row] = await db
    .select()
    .from(githubApps)
    .where(eq(githubApps.organizationId, organizationId));
  return row ? unsealApp(row, urls) : null;
}

/** An app by its id, whichever workspace it is of. */
export async function loadAppById(
  id: string,
  urls: GithubUrls = githubUrlsFromEnv(),
): Promise<{ id: string; organizationId: string; config: GithubConfig } | null> {
  const [row] = await db.select().from(githubApps).where(eq(githubApps.id, id));
  const app = row ? unsealApp(row, urls) : null;
  return app && row ? { ...app, organizationId: row.organizationId } : null;
}

function unsealApp(row: typeof githubApps.$inferSelect, urls: GithubUrls) {
  try {
    return { id: row.id, config: unseal(row.credentialsEncrypted, urls) };
  } catch (error) {
    console.error(`The GitHub App of workspace ${row.organizationId} cannot be read.`, error);
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
