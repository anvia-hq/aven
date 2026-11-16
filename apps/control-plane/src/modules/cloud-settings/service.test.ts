import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { enabledCloudProviders } from "@aven/sandbox/cloud-config";
import {
  setSpacesSettings,
  spacesApiBase,
  spacesApiKey,
  spacesRunnerUrl,
} from "@aven/sandbox/spaces/config";
import { eq } from "drizzle-orm";

import { keepPlatformSettings } from "../../testing/kept-platform-settings";
import { cloudSettingsService } from "./service";

const env = {};

const fromEnv = {
  AVEN_SPACES_API_BASE: "https://spaces.from-env.com/api/v1",
  AVEN_SPACES_API_KEY: "spk_env_key",
  BETTER_AUTH_URL: "https://aven.example.com",
};

const kept = {
  base: process.env.AVEN_SPACES_API_BASE,
  key: process.env.AVEN_SPACES_API_KEY,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

keepPlatformSettings(["spaces_settings"], { cleared: true });

afterAll(() => {
  restore("AVEN_SPACES_API_BASE", kept.base);
  restore("AVEN_SPACES_API_KEY", kept.key);
  setSpacesSettings(null);
});

describe("the Aven Cloud sandbox settings", () => {
  test("what is saved here is what a sandbox boot uses", async () => {
    const saved = await cloudSettingsService.save(
      {
        base: "https://spaces.example.com/api/v1/",
        runnerUrl: "https://aven.example.com/api/",
        apiKey: "spk_saved_key",
      },
      env,
    );

    expect(saved).toEqual({
      provider: "spaces",
      base: "https://spaces.example.com/api/v1",
      runnerUrl: "https://aven.example.com/api",
      keyHint: "_key",
      source: "platform",
    });
    expect(spacesApiBase()).toBe("https://spaces.example.com/api/v1");
    expect(spacesApiKey()).toBe("spk_saved_key");
    expect(spacesRunnerUrl()).toBe("https://aven.example.com/api");
    expect(enabledCloudProviders()).toEqual(["spaces"]);
  });

  test("saving without a key keeps the one already saved", async () => {
    await cloudSettingsService.save(
      { base: "https://other.example.com/api/v1", runnerUrl: "https://aven.example.com/api" },
      env,
    );

    expect(spacesApiKey()).toBe("spk_saved_key");
    expect(spacesApiBase()).toBe("https://other.example.com/api/v1");
  });

  test("an address that is not http is refused", () => {
    expect(
      cloudSettingsService.save({ base: "nope", runnerUrl: "https://aven.example.com/api" }, env),
    ).rejects.toThrow("must be an http or https address");
  });

  test("a row saved earlier gives way to the environment", async () => {
    restore("AVEN_SPACES_API_BASE", fromEnv.AVEN_SPACES_API_BASE);
    restore("AVEN_SPACES_API_KEY", fromEnv.AVEN_SPACES_API_KEY);

    await cloudSettingsService.apply();

    expect(spacesApiBase()).toBe("https://spaces.from-env.com/api/v1");
    expect(spacesApiKey()).toBe("spk_env_key");

    restore("AVEN_SPACES_API_BASE", undefined);
    restore("AVEN_SPACES_API_KEY", undefined);

    await cloudSettingsService.apply();

    expect(spacesApiKey()).toBe("spk_saved_key");
  });

  test("a half-set environment uses neither it nor the row, and says so the same way either place", async () => {
    const only = { AVEN_SPACES_RUNNER_URL: "https://aven.example.com/api" };

    await cloudSettingsService.apply(only);

    expect(spacesApiBase()).toBeNull();
    expect(await cloudSettingsService.view(only)).toBeNull();
  });

  test("the environment wins, and what it sets cannot be edited here", async () => {
    expect(await cloudSettingsService.view(fromEnv)).toEqual({
      provider: "spaces",
      base: "https://spaces.from-env.com/api/v1",
      runnerUrl: "https://aven.example.com/api",
      keyHint: "",
      source: "env",
    });
    expect(
      cloudSettingsService.save(
        { base: "https://spaces.example.com/api/v1", runnerUrl: "https://aven.example.com/api" },
        fromEnv,
      ),
    ).rejects.toThrow("AVEN_SPACES_API_BASE");
  });

  test("removing forgets the sandbox", async () => {
    await cloudSettingsService.remove(env);

    expect(await cloudSettingsService.view(env)).toBeNull();
    expect(spacesApiBase()).toBeNull();
  });

  test("removing what is not saved says so", () => {
    expect(cloudSettingsService.remove(env)).rejects.toThrow("No Aven Cloud sandbox is saved here");
  });

  test("a row that cannot be read leaves the sandbox off rather than the server unstarted", async () => {
    await db
      .insert(platformSettings)
      .values({ key: "spaces_settings", value: "not a value" })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: "not a value" } });

    await cloudSettingsService.apply(env);

    expect(spacesApiBase()).toBeNull();
    expect(await cloudSettingsService.view(env)).toBeNull();

    await db.delete(platformSettings).where(eq(platformSettings.key, "spaces_settings"));
  });
});
