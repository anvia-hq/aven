import { afterAll, describe, expect, test } from "bun:test";

import {
  setSpacesSettings,
  spacesApiBase,
  spacesApiKey,
  spacesRunnerUrl,
} from "@aven/sandbox/spaces/config";

import { keepPlatformSettings } from "../../testing/kept-platform-settings";
import { cloudSettingsService } from "./service";

const env = {};

keepPlatformSettings(["spaces_settings"], { cleared: true });

afterAll(() => setSpacesSettings(null));

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
  });

  test("saving without a key keeps the one already saved", async () => {
    await cloudSettingsService.save(
      { base: "https://other.example.com/api/v1", runnerUrl: "https://aven.example.com/api" },
      env,
    );

    expect(spacesApiKey()).toBe("spk_saved_key");
    expect(spacesApiBase()).toBe("https://other.example.com/api/v1");
  });

  test("an address that is not http is refused", async () => {
    expect(
      cloudSettingsService.save({ base: "nope", runnerUrl: "https://aven.example.com/api" }, env),
    ).rejects.toThrow("must be an http or https address");
  });

  test("the environment wins, and what it sets cannot be edited here", async () => {
    const fromEnv = {
      AVEN_SPACES_API_BASE: "https://spaces.from-env.com/api/v1",
      AVEN_SPACES_API_KEY: "spk_env_key",
      BETTER_AUTH_URL: "https://aven.example.com",
    };

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

  test("removing what is not saved says so", async () => {
    expect(cloudSettingsService.remove(env)).rejects.toThrow("No Aven Cloud sandbox is saved here");
  });
});
