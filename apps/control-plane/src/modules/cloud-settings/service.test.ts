import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { enabledCloudProviders } from "@aven/sandbox/cloud-config";
import { setSandboxSettings } from "@aven/sandbox/settings";
import { boatApiBase, boatApiKey } from "@aven/sandbox/boat/client";
import { spacesApiBase, spacesApiKey, spacesRunnerUrl } from "@aven/sandbox/spaces/config";
import { eq } from "drizzle-orm";

import { keepPlatformSettings } from "../../testing/kept-platform-settings";
import { cloudSettingsService } from "./service";

keepPlatformSettings(["spaces_settings"], { cleared: true });

afterAll(() => setSandboxSettings(null));

describe("the Aven Cloud sandbox settings", () => {
  test("what is saved here is what a sandbox boot uses", async () => {
    const saved = await cloudSettingsService.save({
      provider: "spaces",
      base: "https://spaces.example.com/api/v1/",
      runnerUrl: "https://aven.example.com/api/",
      apiKey: "spk_saved_key",
    });

    expect(saved).toEqual({
      provider: "spaces",
      base: "https://spaces.example.com/api/v1",
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
      runnerUrl: "",
    });

    expect(spacesApiKey()).toBe("spk_saved_key");
    expect(spacesApiBase()).toBe("https://other.example.com/api/v1");
  });

  test("switching to another platform needs that platform's own key, and replaces the first", async () => {
    await expect(
      cloudSettingsService.save({ provider: "boat", base: "", runnerUrl: "" }),
    ).rejects.toThrow("API key");

    expect(spacesApiKey()).toBe("spk_saved_key");

    const saved = await cloudSettingsService.save({
      provider: "boat",
      base: "",
      runnerUrl: "",
      apiKey: "boat_saved_key",
    });

    expect(saved).toMatchObject({ provider: "boat", base: "" });
    expect(boatApiKey()).toBe("boat_saved_key");
    expect(boatApiBase()).toBe("https://boat.dev/api/v1");
    expect(spacesApiKey()).toBeNull();
    expect(enabledCloudProviders()).toEqual(["boat"]);
  });

  test("spaces needs its server's address, and an address that is not http is refused", async () => {
    await expect(
      cloudSettingsService.save({
        provider: "spaces",
        base: "",
        runnerUrl: "",
        apiKey: "spk_key",
      }),
    ).rejects.toThrow("must be an http or https address");
    await expect(
      cloudSettingsService.save({
        provider: "boat",
        base: "nope",
        runnerUrl: "",
      }),
    ).rejects.toThrow("must be an http or https address");
  });

  test("a row saved before there was a choice of platform is a spaces one", async () => {
    const { encryptSecret } = await import("@aven/server-kit/crypto");
    const value = JSON.stringify({
      base: "https://old.example.com/api/v1",
      runnerUrl: "",
      apiKeyEncrypted: encryptSecret("spk_old_key"),
      keyHint: "_key",
    });

    await db
      .insert(platformSettings)
      .values({ key: "spaces_settings", value })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value } });
    await cloudSettingsService.apply();

    expect(await cloudSettingsService.view()).toMatchObject({ provider: "spaces" });
    expect(spacesApiKey()).toBe("spk_old_key");
  });

  test("removing forgets the sandbox", async () => {
    await cloudSettingsService.remove();

    expect(await cloudSettingsService.view()).toBeNull();
    expect(spacesApiBase()).toBeNull();
    expect(enabledCloudProviders()).toEqual([]);
  });

  test("removing what is not saved says so", () => {
    expect(cloudSettingsService.remove()).rejects.toThrow("No Aven Cloud sandbox is saved here");
  });

  test("a row that cannot be read leaves the sandbox off rather than the server unstarted", async () => {
    await db
      .insert(platformSettings)
      .values({ key: "spaces_settings", value: "not a value" })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: "not a value" } });

    await cloudSettingsService.apply();

    expect(spacesApiBase()).toBeNull();
    expect(await cloudSettingsService.view()).toBeNull();

    await db.delete(platformSettings).where(eq(platformSettings.key, "spaces_settings"));
  });
});
