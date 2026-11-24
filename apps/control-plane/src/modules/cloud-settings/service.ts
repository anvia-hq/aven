import { db } from "@aven/db/client";
import { cloudProviderConfigs } from "@aven/db/schema/cloud-provider-configs";
import type { CloudProviderConfigRow } from "@aven/db/schema/types";
import {
  LIZARD_STORAGE_MICROS_PER_GB_MONTH,
  lizardComputeMicrosPerHour,
} from "@aven/sandbox/lizard/config";
import {
  SPRITES_COMPUTE_MICROS_PER_HOUR,
  SPRITES_STORAGE_MICROS_PER_GB_MONTH,
} from "@aven/sandbox/sprites/config";
import { setSandboxSettings } from "@aven/sandbox/settings";
import type { SandboxProviderName, SandboxSettings } from "@aven/sandbox/settings";
import type { ProviderCredentials } from "@aven/sandbox/types";
import { eq } from "drizzle-orm";

import { decryptOrUnavailable, encryptSecret } from "@aven/server-kit/crypto";
import { NotFoundError, UnprocessableError } from "@aven/server-kit/errors";
import { runtimesService } from "../runtimes/service";
import { activeProviderConfigId, credentialsForConfig } from "./credentials";
import type { SaveCloudSettingsBody } from "./schema";
import type { CloudSettingsView } from "./types";

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

async function readActiveConfig(): Promise<CloudProviderConfigRow | null> {
  const [row] = await db
    .select()
    .from(cloudProviderConfigs)
    .where(eq(cloudProviderConfigs.status, "active"))
    .limit(1);
  return row ?? null;
}

function asProviderName(provider: string): SandboxProviderName | null {
  return provider === "boat" ||
    provider === "spaces" ||
    provider === "lizard" ||
    provider === "sprites"
    ? provider
    : null;
}

function defaultRatesFor(provider: SandboxProviderName) {
  if (provider === "lizard") {
    return {
      computeMicrosPerHour: lizardComputeMicrosPerHour("default"),
      storageMicrosPerGbMonth: LIZARD_STORAGE_MICROS_PER_GB_MONTH,
    };
  }

  if (provider === "sprites") {
    return {
      computeMicrosPerHour: SPRITES_COMPUTE_MICROS_PER_HOUR,
      storageMicrosPerGbMonth: SPRITES_STORAGE_MICROS_PER_GB_MONTH,
    };
  }

  return {
    computeMicrosPerHour: null,
    storageMicrosPerGbMonth: null,
  };
}

function baseLabelFor(provider: SandboxProviderName) {
  if (provider === "lizard") return "The Lizard API address";

  if (provider === "sprites") return "The Sprites API address";

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

const optionalAddress = (value: string, label: string) =>
  value === "" ? "" : addressOf(value, label);

export const cloudSettingsService = {
  async view(): Promise<CloudSettingsView | null> {
    const active = await readActiveConfig();

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
    return activeProviderConfigId();
  },

  async activeConfigRef(): Promise<{ id: string; provider: string } | null> {
    const active = await readActiveConfig();
    return active ? { id: active.id, provider: active.provider } : null;
  },

  async credentialsFor(configId: string): Promise<ProviderCredentials | null> {
    return credentialsForConfig(configId);
  },

  async credentialsForProvider(provider: string): Promise<ProviderCredentials | null> {
    const active = await readActiveConfig();

    if (active && active.provider === provider) {
      return credentialsForConfig(active.id);
    }

    const draining = await this.drainingConfigs();
    const match = draining.find((row) => row.provider === provider);
    return match ? credentialsForConfig(match.id) : null;
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
    const existingActive = await readActiveConfig();
    const sameProvider = existingActive?.provider === body.provider;
    const existingEncrypted = existingActive?.apiKeyEncrypted ?? "";
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
    const keyHint = body.apiKey ? body.apiKey.slice(-4) : (existingActive?.keyHint ?? "");
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

    await this.apply();
    await runtimesService.ensureCloud();
    return this.view();
  },

  async remove() {
    const active = await readActiveConfig();

    if (!active) {
      throw new NotFoundError("No Aven Cloud sandbox is saved here");
    }

    await db
      .update(cloudProviderConfigs)
      .set({ status: "draining", drainingSince: new Date() })
      .where(eq(cloudProviderConfigs.id, active.id));

    await this.apply();
  },

  async apply() {
    const active = await readActiveConfig();
    setSandboxSettings(settingsOfRow(active));
  },
};
