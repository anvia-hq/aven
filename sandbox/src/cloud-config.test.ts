import { afterEach, describe, expect, test } from "bun:test";

import {
  cloudEnabled,
  cloudProviderNames,
  disabledTemplateIds,
  enabledCloudProviders,
  enabledTemplateIds,
} from "./cloud-config";
import { setSandboxSettings } from "./settings";

afterEach(() => setSandboxSettings(null));

describe("the sandbox platform", () => {
  test("nothing is offered until the platform saves a sandbox", () => {
    expect(enabledCloudProviders()).toEqual([]);
    expect(cloudEnabled("boat")).toBe(false);
    expect(cloudEnabled("spaces")).toBe(false);
    expect(cloudEnabled("lizard")).toBe(false);
  });

  test("boat is offered with its key alone, and spaces or lizard are not", () => {
    setSandboxSettings({ provider: "boat", base: "", apiKey: "boat_test_key", runnerUrl: "" });

    expect(enabledCloudProviders()).toEqual(["boat"]);
    expect(cloudEnabled("boat")).toBe(true);
    expect(cloudEnabled("spaces")).toBe(false);
    expect(cloudEnabled("lizard")).toBe(false);
    expect(cloudEnabled("vercel")).toBe(false);
  });

  test("lizard is offered with its key alone", () => {
    setSandboxSettings({
      provider: "lizard",
      base: "",
      project: "my-project",
      apiKey: "liz_test_key",
      runnerUrl: "",
    });

    expect(enabledCloudProviders()).toEqual(["lizard"]);
    expect(cloudEnabled("lizard")).toBe(true);
    expect(cloudEnabled("boat")).toBe(false);
  });

  test("spaces is offered only once its address and its key are both set", () => {
    setSandboxSettings({ provider: "spaces", base: "", apiKey: "sk_test_key", runnerUrl: "" });

    expect(enabledCloudProviders()).toEqual([]);

    setSandboxSettings({
      provider: "spaces",
      base: "http://spaces.test:8787/api/v1/",
      apiKey: "sk_test_key",
      runnerUrl: "",
    });

    expect(enabledCloudProviders()).toEqual(["spaces"]);
  });

  test("only the saved platform has a template on offer", () => {
    setSandboxSettings({ provider: "boat", base: "", apiKey: "boat_test_key", runnerUrl: "" });

    expect(enabledTemplateIds()).toHaveLength(1);
    expect(disabledTemplateIds()).toHaveLength(2);
  });

  test("the registry names one cloud provider per folder", () => {
    expect(cloudProviderNames()).toEqual(["boat", "spaces", "lizard"]);
  });
});
