import { db } from "@aven/db/client";
import { cloudProviderConfigs } from "@aven/db/schema/cloud-provider-configs";
import type { ProviderCredentials } from "@aven/sandbox/types";
import { decryptOrUnavailable } from "@aven/server-kit/crypto";
import { eq } from "drizzle-orm";

export async function credentialsForConfig(configId: string): Promise<ProviderCredentials | null> {
  const [row] = await db
    .select()
    .from(cloudProviderConfigs)
    .where(eq(cloudProviderConfigs.id, configId))
    .limit(1);

  if (!row || !row.apiKeyEncrypted) return null;

  try {
    const apiKey = decryptOrUnavailable(row.apiKeyEncrypted, {
      logged: "Could not decrypt the saved Aven Cloud sandbox key:",
      message: "The saved Aven Cloud sandbox key could not be read; enter it again",
    });
    return {
      base: row.base,
      project: row.project,
      apiKey,
      runnerUrl: row.runnerUrl,
    };
  } catch {
    return null;
  }
}

export async function activeProviderConfigId(): Promise<string | null> {
  const [row] = await db
    .select({ id: cloudProviderConfigs.id })
    .from(cloudProviderConfigs)
    .where(eq(cloudProviderConfigs.status, "active"))
    .limit(1);
  return row?.id ?? null;
}
