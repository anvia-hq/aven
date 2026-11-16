import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  cloudEnabled,
  cloudProviderNames,
  cloudProviders,
  cloudTemplateName,
  enabledCloudProviders,
  offerCloudProviders,
} from "./cloud-config";

const kept = {
  providers: process.env.AVEN_CLOUD_PROVIDERS,
  boatKey: process.env.AVEN_BOAT_API_KEY,
  spacesKey: process.env.AVEN_SPACES_API_KEY,
  spacesBase: process.env.AVEN_SPACES_API_BASE,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  process.env.AVEN_CLOUD_PROVIDERS = "boat";
  process.env.AVEN_BOAT_API_KEY = "boat_test_key";
  delete process.env.AVEN_SPACES_API_KEY;
  delete process.env.AVEN_SPACES_API_BASE;
});

afterEach(() => {
  restore("AVEN_CLOUD_PROVIDERS", kept.providers);
  restore("AVEN_BOAT_API_KEY", kept.boatKey);
  restore("AVEN_SPACES_API_KEY", kept.spacesKey);
  restore("AVEN_SPACES_API_BASE", kept.spacesBase);
});

describe("AVEN_CLOUD_PROVIDERS", () => {
  test("names its providers in a list, nothing named is off, and a name that is not a provider is refused", () => {
    expect(cloudProviders(undefined)).toEqual([]);
    expect(cloudProviders("")).toEqual([]);
    expect(cloudProviders(" boat , boat ")).toEqual(["boat"]);
    expect(() => cloudProviders("boat,vercel")).toThrow("names vercel");
  });

  test("a provider is on only when it is named and has what it needs", () => {
    expect(enabledCloudProviders()).toEqual(["boat"]);
    expect(cloudEnabled("boat")).toBe(true);
    expect(cloudEnabled("vercel")).toBe(false);
    expect(cloudTemplateName("boat")).toBe("Aven Cloud");

    delete process.env.AVEN_BOAT_API_KEY;

    expect(enabledCloudProviders()).toEqual([]);
    expect(cloudEnabled("boat")).toBe(false);
  });

  test("spaces is offered only once its address and its key are both set", () => {
    process.env.AVEN_CLOUD_PROVIDERS = "boat,spaces";
    process.env.AVEN_SPACES_API_KEY = "sk_test_key";

    expect(enabledCloudProviders()).toEqual(["boat"]);

    process.env.AVEN_SPACES_API_BASE = "http://spaces.test:8787/api/v1/";

    expect(enabledCloudProviders()).toEqual(["boat", "spaces"]);
    expect(cloudTemplateName("spaces")).toBe("Aven Cloud · spaces");
  });

  test("a provider saved on the platform is offered without naming it in the environment", () => {
    process.env.AVEN_SPACES_API_KEY = "spk_test_key";
    process.env.AVEN_SPACES_API_BASE = "https://spaces.test/api/v1";
    offerCloudProviders(["spaces"]);

    try {
      expect(cloudProviders(undefined)).toEqual(["spaces"]);
      expect(enabledCloudProviders()).toEqual(["boat", "spaces"]);
    } finally {
      offerCloudProviders([]);
    }
  });

  test("the registry names one cloud provider per folder", () => {
    expect(cloudProviderNames()).toEqual(["boat", "spaces"]);
  });
});
