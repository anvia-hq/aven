import { afterEach, describe, expect, test } from "bun:test";

import { setSandboxSettings } from "../settings";
import { spacesApiBase, spacesApiKey, spacesRunnerUrl } from "./config";

afterEach(() => setSandboxSettings(null));

describe("the spaces settings", () => {
  test("the settings saved on the platform are what is used, and can be cleared", () => {
    setSandboxSettings({
      provider: "spaces",
      base: "https://spaces.example.com/api/v1/",
      apiKey: "spk_saved",
      runnerUrl: "https://aven.example.com/api/",
    });

    expect(spacesApiBase()).toBe("https://spaces.example.com/api/v1");
    expect(spacesApiKey()).toBe("spk_saved");
    expect(spacesRunnerUrl()).toBe("https://aven.example.com/api");

    setSandboxSettings(null);
    expect(spacesApiKey()).toBeNull();
    expect(spacesApiBase()).toBeNull();
  });

  test("settings saved for another platform are not spaces settings", () => {
    setSandboxSettings({
      provider: "boat",
      base: "https://spaces.example.com/api/v1",
      apiKey: "boat_saved",
      runnerUrl: "",
    });

    expect(spacesApiKey()).toBeNull();
    expect(spacesApiBase()).toBeNull();
  });

  test("the server address is an http or https address, or nothing", () => {
    expect(spacesApiBase(undefined)).toBeNull();
    expect(spacesApiBase("  ")).toBeNull();
    expect(spacesApiBase("not a url")).toBeNull();
    expect(spacesApiBase("ftp://spaces.test")).toBeNull();
    expect(spacesApiBase("https://spaces.test/api/v1/")).toBe("https://spaces.test/api/v1");
    expect(spacesApiBase("http://192.168.1.5:8787/api/v1")).toBe("http://192.168.1.5:8787/api/v1");
  });

  test("the address a sandbox dials is its own setting and may be on a private network", () => {
    expect(
      spacesRunnerUrl({ BETTER_AUTH_URL: "https://aven.example.com" }, "http://192.168.1.10:8000/"),
    ).toBe("http://192.168.1.10:8000");
    expect(spacesRunnerUrl({ BETTER_AUTH_URL: "https://aven.example.com" }, "")).toBe(
      "https://aven.example.com/api",
    );
  });

  test("an address that is not http is refused", () => {
    expect(() => spacesRunnerUrl({}, "ftp://x")).toThrow("http or https");
    expect(() => spacesRunnerUrl({}, "nope")).toThrow("http or https");
  });
});
