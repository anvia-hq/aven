import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { cloudProviderConfigs } from "@aven/db/schema/cloud-provider-configs";
import { enabledCloudProviders } from "@aven/sandbox/cloud-config";
import { setSandboxSettings } from "@aven/sandbox/settings";
import { boatApiBase, boatApiKey } from "@aven/sandbox/boat/client";
import { lizardApiBase, lizardApiKey, lizardProject } from "@aven/sandbox/lizard/config";
import { spacesApiBase, spacesApiKey, spacesRunnerUrl } from "@aven/sandbox/spaces/config";
import {
  SPRITES_COMPUTE_MICROS_PER_HOUR,
  SPRITES_STORAGE_MICROS_PER_GB_MONTH,
  spritesApiBase,
  spritesApiKey,
} from "@aven/sandbox/sprites/config";
import { eq, inArray } from "drizzle-orm";

import { cloudSettingsService } from "./service";

const insertedBefore = new Set<string>();
const priorActiveIds: string[] = [];

beforeAll(async () => {
  const existing = await db
    .select({ id: cloudProviderConfigs.id, status: cloudProviderConfigs.status })
    .from(cloudProviderConfigs);

  for (const row of existing) {
    insertedBefore.add(row.id);

    if (row.status === "active") priorActiveIds.push(row.id);
  }

  if (priorActiveIds.length > 0) {
    await db
      .update(cloudProviderConfigs)
      .set({ status: "draining" })
      .where(inArray(cloudProviderConfigs.id, priorActiveIds));
  }

  setSandboxSettings(null);
});

afterAll(async () => {
  setSandboxSettings(null);
  const current = await db.select({ id: cloudProviderConfigs.id }).from(cloudProviderConfigs);
  const created = current.flatMap((row) => (insertedBefore.has(row.id) ? [] : [row.id]));

  if (created.length > 0) {
    await db.delete(cloudProviderConfigs).where(inArray(cloudProviderConfigs.id, created));
  }

  if (priorActiveIds.length > 0) {
    await db
      .update(cloudProviderConfigs)
      .set({ status: "active" })
      .where(inArray(cloudProviderConfigs.id, priorActiveIds));
  }

  await cloudSettingsService.apply();
});

describe("the Aven Cloud sandbox settings", () => {
  test("what is saved here is what a sandbox boot uses", async () => {
    const saved = await cloudSettingsService.save({
      provider: "spaces",
      base: "https://spaces.example.com/api/v1/",
      project: "",
      runnerUrl: "https://aven.example.com/api/",
      apiKey: "spk_saved_key",
    });

    expect(saved).toEqual({
      provider: "spaces",
      base: "https://spaces.example.com/api/v1",
      project: "",
      runnerUrl: "https://aven.example.com/api",
      keyHint: "_key",
    });
    expect(spacesApiBase()).toBe("https://spaces.example.com/api/v1");
    expect(spacesApiKey()).toBe("spk_saved_key");
    expect(spacesRunnerUrl()).toBe("https://aven.example.com/api");
    expect(enabledCloudProviders()).toEqual(["spaces"]);
  });

  test("saving without a key keeps the one already saved", async () => {
    await cloudSettingsService.save({
      provider: "spaces",
      base: "https://other.example.com/api/v1",
      project: "",
      runnerUrl: "",
    });

    expect(spacesApiKey()).toBe("spk_saved_key");
    expect(spacesApiBase()).toBe("https://other.example.com/api/v1");
  });

  test("switching to another platform needs that platform's own key, and drains the first", async () => {
    const spacesConfigId = await cloudSettingsService.activeConfigId();

    expect(spacesConfigId).not.toBeNull();

    await expect(
      cloudSettingsService.save({ provider: "boat", base: "", project: "", runnerUrl: "" }),
    ).rejects.toThrow("API key");

    expect(spacesApiKey()).toBe("spk_saved_key");

    const saved = await cloudSettingsService.save({
      provider: "boat",
      base: "",
      project: "",
      runnerUrl: "",
      apiKey: "boat_saved_key",
    });

    expect(saved).toMatchObject({ provider: "boat", base: "", project: "" });
    expect(boatApiKey()).toBe("boat_saved_key");
    expect(boatApiBase()).toBe("https://boat.dev/api/v1");
    expect(spacesApiKey()).toBeNull();
    expect(enabledCloudProviders()).toEqual(["boat"]);

    const drainingCreds = await cloudSettingsService.credentialsFor(spacesConfigId!);

    expect(drainingCreds?.apiKey).toBe("spk_saved_key");

    const lizard = await cloudSettingsService.save({
      provider: "lizard",
      base: "",
      project: "aven-prod",
      runnerUrl: "",
      apiKey: "liz_saved_key",
    });

    expect(lizard).toMatchObject({ provider: "lizard", base: "", project: "aven-prod" });
    expect(lizardApiKey()).toBe("liz_saved_key");
    expect(lizardApiBase()).toBe("https://lizard.build");
    expect(lizardProject()).toBe("aven-prod");
    expect(boatApiKey()).toBeNull();
    expect(enabledCloudProviders()).toEqual(["lizard"]);

    const sprites = await cloudSettingsService.save({
      provider: "sprites",
      base: "",
      project: "",
      runnerUrl: "",
      apiKey: "anvia/org-id/token-id/secret",
    });

    expect(sprites).toMatchObject({ provider: "sprites", base: "", project: "" });
    expect(spritesApiKey()).toBe("anvia/org-id/token-id/secret");
    expect(spritesApiBase()).toBe("https://api.sprites.dev");
    expect(enabledCloudProviders()).toEqual(["sprites"]);
    expect(lizardApiKey()).toBeNull();

    const [rates] = await db
      .select({
        compute: cloudProviderConfigs.computeMicrosPerHour,
        storage: cloudProviderConfigs.storageMicrosPerGbMonth,
      })
      .from(cloudProviderConfigs)
      .where(eq(cloudProviderConfigs.status, "active"));

    expect(rates).toEqual({
      compute: SPRITES_COMPUTE_MICROS_PER_HOUR,
      storage: SPRITES_STORAGE_MICROS_PER_GB_MONTH,
    });

    await cloudSettingsService.save({
      provider: "lizard",
      base: "",
      project: "aven-prod",
      runnerUrl: "",
      apiKey: "liz_saved_key",
    });

    expect(enabledCloudProviders()).toEqual(["lizard"]);
  });

  test("spaces needs its server's address, and an address that is not http is refused", async () => {
    await expect(
      cloudSettingsService.save({
        provider: "spaces",
        base: "",
        project: "",
        runnerUrl: "",
        apiKey: "spk_key",
      }),
    ).rejects.toThrow("must be an http or https address");
    await expect(
      cloudSettingsService.save({
        provider: "boat",
        base: "nope",
        project: "",
        runnerUrl: "",
        apiKey: "boat_key",
      }),
    ).rejects.toThrow("must be an http or https address");
  });

  test("removing marks the active config draining and clears active settings", async () => {
    const activeId = await cloudSettingsService.activeConfigId();

    expect(activeId).not.toBeNull();

    await cloudSettingsService.remove();

    expect(await cloudSettingsService.view()).toBeNull();
    expect(lizardApiKey()).toBeNull();
    expect(enabledCloudProviders()).toEqual([]);

    const creds = await cloudSettingsService.credentialsFor(activeId!);

    expect(creds?.apiKey).toBe("liz_saved_key");
  });

  test("removing what is not saved says so", () => {
    expect(cloudSettingsService.remove()).rejects.toThrow("No Aven Cloud sandbox is saved here");
  });

  test("an unreadable encrypted key leaves the sandbox off without wiping the config row", async () => {
    const [inserted] = await db
      .insert(cloudProviderConfigs)
      .values({
        provider: "spaces",
        status: "active",
        base: "https://broken.example.com/api/v1",
        project: "",
        runnerUrl: "",
        apiKeyEncrypted: "not-valid-ciphertext",
        keyHint: "nope",
      })
      .returning({ id: cloudProviderConfigs.id });

    await cloudSettingsService.apply();

    expect(spacesApiBase()).toBeNull();

    const [stillThere] = await db
      .select({
        status: cloudProviderConfigs.status,
        apiKeyEncrypted: cloudProviderConfigs.apiKeyEncrypted,
      })
      .from(cloudProviderConfigs)
      .where(eq(cloudProviderConfigs.id, inserted!.id));

    expect(stillThere).toEqual({
      status: "active",
      apiKeyEncrypted: "not-valid-ciphertext",
    });

    await db.delete(cloudProviderConfigs).where(eq(cloudProviderConfigs.id, inserted!.id));
  });
});
