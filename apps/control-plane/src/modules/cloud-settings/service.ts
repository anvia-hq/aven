import { db } from "@aven/db/client";
import { cloudProviderConfigs } from "@aven/db/schema/cloud-provider-configs";
import { platformSettings } from "@aven/db/schema/platform-settings";
import type { CloudProviderConfigRow } from "@aven/db/schema/types";
import {
  LIZARD_STORAGE_MICROS_PER_GB_MONTH,
  lizardComputeMicrosPerHour,
} from "@aven/sandbox/lizard/config";
import { setSandboxSettings } from "@aven/sandbox/settings";
import type { SandboxProviderName, SandboxSettings } from "@aven/sandbox/settings";
import type { ProviderCredentials } from "@aven/sandbox/types";
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

function decryptKey(encrypted: string) {
  return decryptOrUnavailable(encrypted, {
    logged: "Could not decrypt the saved Aven Cloud sandbox key:",
    message: "The saved Aven Cloud sandbox key could not be read; enter it again",
  });
}

async function readLegacyStored(): Promise<StoredCloudSettings | null> {
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

async function readActiveConfig(): Promise<CloudProviderConfigRow | null> {
  const [row] = await db
    .select()
    .from(cloudProviderConfigs)
    .where(eq(cloudProviderConfigs.status, "active"))
    .limit(1);
  return row ?? null;
}

function asProviderName(provider: string): SandboxProviderName | null {
  return provider === "boat" || provider === "spaces" || provider === "lizard" ? provider : null;
}

function defaultRatesFor(provider: SandboxProviderName) {
  if (provider === "lizard") {
    return {
      computeMicrosPerHour: lizardComputeMicrosPerHour("default"),
      storageMicrosPerGbMonth: LIZARD_STORAGE_MICROS_PER_GB_MONTH,
    };
  }

  return {
    computeMicrosPerHour: null,
    storageMicrosPerGbMonth: null,
  };
}

function baseLabelFor(provider: SandboxProviderName) {
  if (provider === "lizard") return "The Lizard API address";

  return "The boat API address";
}

function settingsOfRow(row: CloudProviderConfigRow | null): SandboxSettings | null {
  if (!row || !row.apiKeyEncrypted) return null;

  const provider = asProviderName(row.provider);

  if (!provider) return null;

  try {
    return {
      provider,
      base: row.base,
      project: row.project,
      apiKey: decryptKey(row.apiKeyEncrypted),
      runnerUrl: row.runnerUrl,
    };
  } catch (error) {
    console.error(
      "Could not read the saved Aven Cloud sandbox settings:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

function settingsOfLegacy(stored: StoredCloudSettings | null): SandboxSettings | null {
  if (!stored) return null;

  try {
    return {
      provider: stored.provider,
      base: stored.base,
      project: stored.project,
      apiKey: decryptKey(stored.apiKeyEncrypted),
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

async function syncLegacyToConfig(): Promise<CloudProviderConfigRow | null> {
  const legacy = await readLegacyStored();

  if (!legacy) return null;

  const [existing] = await db
    .select()
    .from(cloudProviderConfigs)
    .where(eq(cloudProviderConfigs.status, "active"))
    .limit(1);

  if (existing) return existing;

  const rates = defaultRatesFor(legacy.provider);
  const [inserted] = await db
    .insert(cloudProviderConfigs)
    .values({
      provider: legacy.provider,
      status: "active",
      base: legacy.base,
      project: legacy.project,
      runnerUrl: legacy.runnerUrl,
      apiKeyEncrypted: legacy.apiKeyEncrypted,
      keyHint: legacy.keyHint,
      ...rates,
    })
    .returning();
  return inserted ?? null;
}

export const cloudSettingsService = {
  async view(): Promise<CloudSettingsView | null> {
    const legacy = await readLegacyStored();
    const active = await readActiveConfig();

    if (legacy) {
      return {
        provider: legacy.provider,
        base: legacy.base,
        project: legacy.project,
        runnerUrl: legacy.runnerUrl,
        keyHint: legacy.keyHint,
      };
    }

    if (!active) return null;

    const provider = asProviderName(active.provider);

    if (!provider) return null;

    return {
      provider,
      base: active.base,
      project: active.project,
      runnerUrl: active.runnerUrl,
      keyHint: active.keyHint,
    };
  },

  async activeConfigId(): Promise<string | null> {
    const active = (await readActiveConfig()) ?? (await syncLegacyToConfig());
    return active?.id ?? null;
  },

  async credentialsFor(configId: string): Promise<ProviderCredentials | null> {
    const [row] = await db
      .select()
      .from(cloudProviderConfigs)
      .where(eq(cloudProviderConfigs.id, configId))
      .limit(1);

    if (!row || !row.apiKeyEncrypted) return null;

    try {
      return {
        base: row.base,
        project: row.project,
        apiKey: decryptKey(row.apiKeyEncrypted),
        runnerUrl: row.runnerUrl,
      };
    } catch {
      return null;
    }
  },

  async drainingConfigs(): Promise<CloudProviderConfigRow[]> {
    return db
      .select()
      .from(cloudProviderConfigs)
      .where(eq(cloudProviderConfigs.status, "draining"));
  },

  async markDrained(configId: string, now = new Date()) {
    await db
      .update(cloudProviderConfigs)
      .set({
        status: "drained",
        apiKeyEncrypted: null,
        drainedAt: now,
      })
      .where(eq(cloudProviderConfigs.id, configId));
  },

  async save(body: SaveCloudSettingsBody) {
    const existingActive = (await readActiveConfig()) ?? (await syncLegacyToConfig());
    const legacy = await readLegacyStored();
    const currentProvider = existingActive?.provider ?? legacy?.provider;
    const sameProvider = currentProvider === body.provider;
    const existingEncrypted = existingActive?.apiKeyEncrypted ?? legacy?.apiKeyEncrypted ?? "";
    const apiKey =
      body.apiKey || (sameProvider && existingEncrypted ? decryptKey(existingEncrypted) : "");

    if (!apiKey) throw new UnprocessableError("Enter the sandbox provider's API key");

    const base =
      body.provider === "spaces"
        ? addressOf(body.base, "The spaces server's address")
        : optionalAddress(body.base, baseLabelFor(body.provider));
    const project = body.provider === "lizard" ? (body.project ?? "").trim() : "";
    const runnerUrl = optionalAddress(body.runnerUrl, "The address a sandbox dials");
    const apiKeyEncrypted = body.apiKey ? encryptSecret(body.apiKey) : existingEncrypted;
    const keyHint = body.apiKey
      ? body.apiKey.slice(-4)
      : (existingActive?.keyHint ?? legacy?.keyHint ?? "");
    const rates = defaultRatesFor(body.provider);
    const now = new Date();

    if (existingActive && !sameProvider) {
      await db
        .update(cloudProviderConfigs)
        .set({ status: "draining", drainingSince: now })
        .where(eq(cloudProviderConfigs.id, existingActive.id));
      await db.insert(cloudProviderConfigs).values({
        provider: body.provider,
        status: "active",
        base,
        project,
        runnerUrl,
        apiKeyEncrypted,
        keyHint,
        ...rates,
      });
    } else if (existingActive) {
      await db
        .update(cloudProviderConfigs)
        .set({ base, project, runnerUrl, apiKeyEncrypted, keyHint })
        .where(eq(cloudProviderConfigs.id, existingActive.id));
    } else {
      await db.insert(cloudProviderConfigs).values({
        provider: body.provider,
        status: "active",
        base,
        project,
        runnerUrl,
        apiKeyEncrypted,
        keyHint,
        ...rates,
      });
    }

    const value = JSON.stringify({
      provider: body.provider,
      base,
      project,
      runnerUrl,
      apiKeyEncrypted,
      keyHint,
    });
    await db
      .insert(platformSettings)
      .values({ key: KEY, value })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { value, updatedAt: now },
      });

    await this.apply();
    await runtimesService.ensureCloud();
    return this.view();
  },

  async remove() {
    const active = await readActiveConfig();
    const removedLegacy = await db
      .delete(platformSettings)
      .where(eq(platformSettings.key, KEY))
      .returning({ key: platformSettings.key });

    if (!active && removedLegacy.length === 0) {
      throw new NotFoundError("No Aven Cloud sandbox is saved here");
    }

    if (active) {
      await db
        .update(cloudProviderConfigs)
        .set({ status: "draining", drainingSince: new Date() })
        .where(eq(cloudProviderConfigs.id, active.id));
    }

    await this.apply();
  },

  async apply() {
    const [legacyRow] = await db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, KEY));

    if (legacyRow) {
      const legacy = await readLegacyStored();

      if (!legacy) {
        await db
          .update(cloudProviderConfigs)
          .set({ status: "drained", apiKeyEncrypted: null, drainedAt: new Date() })
          .where(eq(cloudProviderConfigs.status, "active"));
        setSandboxSettings(null);
        return;
      }

      const active = await readActiveConfig();

      if (!active || active.provider !== legacy.provider) {
        if (active) {
          await db
            .update(cloudProviderConfigs)
            .set({ status: "draining", drainingSince: new Date() })
            .where(eq(cloudProviderConfigs.id, active.id));
        }

        const rates = defaultRatesFor(legacy.provider);
        await db.insert(cloudProviderConfigs).values({
          provider: legacy.provider,
          status: "active",
          base: legacy.base,
          project: legacy.project,
          runnerUrl: legacy.runnerUrl,
          apiKeyEncrypted: legacy.apiKeyEncrypted,
          keyHint: legacy.keyHint,
          ...rates,
        });
      }

      setSandboxSettings(settingsOfLegacy(legacy));
      return;
    }

    const active = await readActiveConfig();
    setSandboxSettings(settingsOfRow(active));
  },
};
