import { describe, expect, test } from "bun:test";

import { ConflictError, ForbiddenError, UnprocessableError } from "../../errors";
import { createSetupState } from "./app-manifest";
import { createGithubAppSetup } from "./app-setup";
import type { GithubConfig } from "./client";

process.env.BETTER_AUTH_SECRET ??= "test-secret";

const urls = { apiUrl: "https://api.github.test", webUrl: "https://github.test" };
const owner = { id: "u1", email: "me@example.com" };
const stranger = { id: "u2", email: "other@example.com" };
const created: GithubConfig = {
  appId: "1",
  privateKey: "pem",
  slug: "aven-x",
  clientId: "c",
  clientSecret: "s",
  ...urls,
};

function setup(configured = false) {
  const saved: GithubConfig[] = [];
  const configuredWith: GithubConfig[] = [];
  const client = {
    configured,
    configure(config: GithubConfig | null) {
      this.configured = config !== null;
      if (config) configuredWith.push(config);
    },
  };
  const converted: string[] = [];
  const service = createGithubAppSetup({
    client,
    urls,
    origin: () => "https://aven.example.com",
    save: async (config) => void saved.push(config),
    convert: async (code) => {
      converted.push(code);
      return created;
    },
    isOwner: (email) => email === owner.email,
  });
  return { service, client, saved, configuredWith, converted };
}

describe("the manifest", () => {
  test("is for a platform owner, named after the host, with a state of theirs", () => {
    const { postUrl, manifest } = setup().service.manifest(owner, {});
    expect(manifest.name).toBe("Aven (aven.example.com)");
    expect(manifest.redirect_url).toBe("https://aven.example.com/api/github/app/callback");
    expect(postUrl).toStartWith("https://github.test/settings/apps/new?state=");
  });

  test("takes a name and an organization", () => {
    const { postUrl, manifest } = setup().service.manifest(owner, {
      name: "Acme Aven",
      organization: "acme",
    });
    expect(manifest.name).toBe("Acme Aven");
    expect(postUrl).toStartWith("https://github.test/organizations/acme/settings/apps/new");
  });

  test("is refused to anyone else, and once an app is set up", () => {
    expect(() => setup().service.manifest(stranger, {})).toThrow(ForbiddenError);
    expect(() => setup(true).service.manifest(owner, {})).toThrow(ConflictError);
  });
});

describe("canSetUp", () => {
  test("is true only for an owner while there is no app", () => {
    expect(setup().service.canSetUp(owner.email)).toBe(true);
    expect(setup().service.canSetUp(stranger.email)).toBe(false);
    expect(setup(true).service.canSetUp(owner.email)).toBe(false);
  });
});

describe("completing the setup", () => {
  test("keeps the app GitHub made and starts using it", async () => {
    const { service, saved, configuredWith, converted, client } = setup();
    await service.complete(owner, { code: "c0de", state: createSetupState(owner.id) });
    expect(converted).toEqual(["c0de"]);
    expect(saved).toEqual([created]);
    expect(configuredWith).toEqual([created]);
    expect(client.configured).toBe(true);
  });

  test("exchanges nothing for a state that is not theirs, or from a stranger", async () => {
    const { service, converted, saved, configuredWith } = setup();
    await expect(
      service.complete(owner, { code: "c", state: createSetupState("someone-else") }),
    ).rejects.toBeInstanceOf(UnprocessableError);
    await expect(service.complete(owner, { code: "c", state: "nonsense" })).rejects.toBeInstanceOf(
      UnprocessableError,
    );
    await expect(
      service.complete(stranger, { code: "c", state: createSetupState(stranger.id) }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(converted).toEqual([]);
    expect(saved).toEqual([]);
    expect(configuredWith).toEqual([]);
  });
});
