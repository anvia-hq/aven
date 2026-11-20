import { afterEach, describe, expect, test } from "bun:test";

import { setSandboxSettings } from "../settings";
import {
  LIZARD_API_BASE,
  LIZARD_DEFAULT_TEMPLATE,
  lizardApiBase,
  lizardApiKey,
  lizardAutoStopSeconds,
  lizardComputeMicrosPerHour,
  lizardConfigured,
  lizardProject,
  lizardRegion,
  lizardRunnerUrl,
  lizardSizeOf,
  lizardTemplate,
} from "./config";

const originalAutoStop = process.env.AVEN_LIZARD_AUTO_STOP_SECONDS;
const originalProject = process.env.LIZARD_PROJECT_ID;
const originalProjectSlug = process.env.LIZARD_PROJECT;
const originalRegion = process.env.AVEN_LIZARD_REGION;
const originalTemplate = process.env.AVEN_LIZARD_TEMPLATE;

afterEach(() => {
  setSandboxSettings(null);
  process.env.AVEN_LIZARD_AUTO_STOP_SECONDS = originalAutoStop;
  process.env.LIZARD_PROJECT_ID = originalProject;
  process.env.LIZARD_PROJECT = originalProjectSlug;
  process.env.AVEN_LIZARD_REGION = originalRegion;
  process.env.AVEN_LIZARD_TEMPLATE = originalTemplate;
});

describe("lizard config", () => {
  test("defaults to lizard.build and base template when unset", () => {
    delete process.env.AVEN_LIZARD_AUTO_STOP_SECONDS;
    delete process.env.LIZARD_PROJECT_ID;
    delete process.env.LIZARD_PROJECT;
    delete process.env.AVEN_LIZARD_REGION;
    delete process.env.AVEN_LIZARD_TEMPLATE;

    expect(lizardApiBase()).toBe(LIZARD_API_BASE);
    expect(lizardApiKey()).toBeNull();
    expect(lizardConfigured()).toBe(false);
    expect(lizardProject()).toBeUndefined();
    expect(lizardRegion()).toBeUndefined();
    expect(lizardTemplate()).toBe(LIZARD_DEFAULT_TEMPLATE);
    expect(lizardAutoStopSeconds()).toBe(7_200);
  });

  test("reads saved settings and strips trailing slashes", () => {
    setSandboxSettings({
      provider: "lizard",
      base: "https://custom.lizard.test/",
      project: "my-project",
      apiKey: "liz_saved_key",
      runnerUrl: "https://aven.example.com/api/",
    });

    expect(lizardApiBase()).toBe("https://custom.lizard.test");
    expect(lizardApiKey()).toBe("liz_saved_key");
    expect(lizardConfigured()).toBe(true);
    expect(lizardProject()).toBe("my-project");
    expect(lizardRunnerUrl()).toBe("https://aven.example.com/api");
  });

  test("maps Aven machine types to Lizard sizes and hourly rates", () => {
    expect(lizardSizeOf("small")).toBe("small");
    expect(lizardSizeOf("default")).toBe("medium");
    expect(lizardSizeOf("large")).toBe("large");
    expect(lizardSizeOf("xlarge")).toBe("big");
    expect(lizardComputeMicrosPerHour("small")).toBe(16_200);
    expect(lizardComputeMicrosPerHour("default")).toBe(32_400);
    expect(lizardComputeMicrosPerHour("large")).toBe(64_800);
    expect(lizardComputeMicrosPerHour("xlarge")).toBe(129_600);
  });

  test("rejects non-http API or runner addresses", () => {
    expect(() => lizardApiBase("ftp://lizard.build")).toThrow("http or https");
    expect(() => lizardRunnerUrl({}, "ws://aven.example.com")).toThrow("http or https");
  });
});
