import { afterEach, describe, expect, test } from "bun:test";

import { setSandboxSettings } from "../settings";
import {
  SPRITES_API_BASE,
  SPRITES_COMPUTE_MICROS_PER_HOUR,
  SPRITES_STORAGE_MICROS_PER_GB_MONTH,
  spritesApiBase,
  spritesApiKey,
  spritesAutoStopSeconds,
  spritesConfigured,
  spritesNameFor,
  spritesRunnerUrl,
} from "./config";

const originalAutoStop = process.env.AVEN_SPRITES_AUTO_STOP_SECONDS;

afterEach(() => {
  setSandboxSettings(null);
  process.env.AVEN_SPRITES_AUTO_STOP_SECONDS = originalAutoStop;
});

describe("sprites config", () => {
  test("defaults to api.sprites.dev with no key and a one hour hold", () => {
    delete process.env.AVEN_SPRITES_AUTO_STOP_SECONDS;

    expect(spritesApiBase()).toBe(SPRITES_API_BASE);
    expect(spritesApiKey()).toBeNull();
    expect(spritesConfigured()).toBe(false);
    expect(spritesAutoStopSeconds()).toBe(3_600);
  });

  test("reads saved settings and strips trailing slashes", () => {
    setSandboxSettings({
      provider: "sprites",
      base: "https://custom.sprites.test/",
      apiKey: "  anvia/org-id/token-id/secret  ",
      runnerUrl: "https://aven.example.com/api/",
    });

    expect(spritesApiBase()).toBe("https://custom.sprites.test");
    expect(spritesApiKey()).toBe("anvia/org-id/token-id/secret");
    expect(spritesConfigured()).toBe(true);
    expect(spritesRunnerUrl()).toBe("https://aven.example.com/api");
  });

  test("keeps the hold between a minute and the hour a Sprite allows", () => {
    process.env.AVEN_SPRITES_AUTO_STOP_SECONDS = "30";
    expect(spritesAutoStopSeconds()).toBe(60);

    process.env.AVEN_SPRITES_AUTO_STOP_SECONDS = "7200";
    expect(spritesAutoStopSeconds()).toBe(3_600);

    process.env.AVEN_SPRITES_AUTO_STOP_SECONDS = "600";
    expect(spritesAutoStopSeconds()).toBe(600);
  });

  test("names a Sprite in a form Sprites accepts, from the runtime alone", () => {
    const runtime = "3ea9bc16-9e0d-47bf-aff5-8c5d6d1b38db";

    expect(spritesNameFor(runtime)).toBe("aven-3ea9bc169e0d47bfaff58c5d");
    expect(spritesNameFor(runtime)).toBe(spritesNameFor(runtime));
    expect(spritesNameFor("../etc/passwd")).toBe("aven-etcpasswd");
  });

  test("prices a fixed 8 vCPU and 8 GB machine and its storage", () => {
    expect(SPRITES_COMPUTE_MICROS_PER_HOUR).toBe(483_000);
    expect(SPRITES_STORAGE_MICROS_PER_GB_MONTH).toBe(500_000);
  });

  test("rejects non-http API or runner addresses", () => {
    expect(() => spritesApiBase("ftp://api.sprites.dev")).toThrow("http or https");
    expect(() => spritesRunnerUrl({}, "ws://aven.example.com")).toThrow("http or https");
  });
});
