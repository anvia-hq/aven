import { describe, expect, test } from "bun:test";

import { ConflictError, ForbiddenError, UnprocessableError } from "../../errors";
import { createSetupState, readSetupState } from "./app-manifest";
import { createGithubAppSetup } from "./app-setup";
import type { GithubConfig } from "./types";

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
    isOwner: async (person) => person.email === owner.email,
  });
  return { service, client, saved, configuredWith, converted };
}

describe("the manifest", () => {
  test("is for a platform owner, named after the host, with a state of theirs", async () => {
    const { postUrl, manifest } = await setup().service.manifest(owner, {});
    expect(manifest.name).toBe("Aven (aven.example.com)");
    expect(manifest.redirect_url).toBe("https://aven.example.com/api/github/app/callback");
    expect(postUrl).toStartWith("https://github.test/settings/apps/new?state=");
  });

  test("takes a name and an organization", async () => {
    const { postUrl, manifest } = await setup().service.manifest(owner, {
      name: "Acme Aven",
      organization: "acme",
    });
    expect(manifest.name).toBe("Acme Aven");
    expect(postUrl).toStartWith("https://github.test/organizations/acme/settings/apps/new");
  });

  test("is private unless the owner asks for it to be installable by anyone", async () => {
    expect((await setup().service.manifest(owner, {})).manifest.public).toBe(false);
    expect((await setup().service.manifest(owner, { public: false })).manifest.public).toBe(false);
    expect((await setup().service.manifest(owner, { public: true })).manifest.public).toBe(true);
  });

  test("is refused to anyone else, and once an app is set up", async () => {
    await expect(setup().service.manifest(stranger, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setup(true).service.manifest(owner, {})).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("canSetUp", () => {
  test("is true only for an owner while there is no app", async () => {
    expect(await setup().service.canSetUp(owner)).toBe(true);
    expect(await setup().service.canSetUp(stranger)).toBe(false);
    expect(await setup(true).service.canSetUp(owner)).toBe(false);
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

function workspaceSetup(options: { hasApp?: boolean } = {}) {
  const kept: { organizationId: string; userId: string; config: GithubConfig }[] = [];
  const forgotten: string[] = [];
  const admins = new Set(["u1:org-1"]);
  const platform = setup(true);
  const service = createGithubAppSetup({
    client: platform.client,
    urls,
    origin: () => "https://aven.example.com",
    saveOrganization: async (organizationId, userId, config) => {
      kept.push({ organizationId, userId, config });
      return "app-1";
    },
    convert: async () => created,
    isOwner: async () => false,
    isAdmin: async (organizationId, userId) => admins.has(`${userId}:${organizationId}`),
    clients: {
      forOrganization: async () => ({
        key: options.hasApp ? "app-1" : "platform",
        client: {} as never,
      }),
      forget: (organizationId) => void forgotten.push(organizationId),
    },
  });
  return { service, kept, forgotten, platform };
}

describe("a workspace's own app", () => {
  test("is offered to an admin of a workspace without one, and to nobody else", async () => {
    expect(await workspaceSetup().service.canSetUpWorkspace(owner, "org-1")).toBe(true);
    expect(await workspaceSetup().service.canSetUpWorkspace(stranger, "org-1")).toBe(false);
    expect(await workspaceSetup().service.canSetUpWorkspace(owner, "org-2")).toBe(false);
    expect(await workspaceSetup({ hasApp: true }).service.canSetUpWorkspace(owner, "org-1")).toBe(
      false,
    );
  });

  test("has a manifest for an admin, with a state that names the workspace, even beside the platform's app", async () => {
    const { service } = workspaceSetup();
    const { postUrl } = await service.manifest(owner, {}, "org-1");
    const state = new URL(postUrl).searchParams.get("state")!;
    expect(readSetupState(state, owner.id)).toEqual({ organizationId: "org-1" });
    await expect(service.manifest(stranger, {}, "org-1")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      workspaceSetup({ hasApp: true }).service.manifest(owner, {}, "org-1"),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  test("is kept for the workspace the state names, and the platform's app is left alone", async () => {
    const { service, kept, forgotten, platform } = workspaceSetup();
    const state = createSetupState(owner.id, Date.now(), "org-1");
    await service.complete(owner, { code: "c0de", state }, "org-1");
    expect(kept).toEqual([{ organizationId: "org-1", userId: owner.id, config: created }]);
    expect(forgotten).toEqual(["org-1"]);
    expect(platform.saved).toEqual([]);
    expect(platform.configuredWith).toEqual([]);
  });

  test("is not kept for another workspace than the one the person is in, or for a non-admin", async () => {
    const { service, kept } = workspaceSetup();
    const state = createSetupState(owner.id, Date.now(), "org-1");
    await expect(service.complete(owner, { code: "c", state }, "org-2")).rejects.toBeInstanceOf(
      UnprocessableError,
    );
    const theirs = createSetupState(stranger.id, Date.now(), "org-1");
    await expect(
      service.complete(stranger, { code: "c", state: theirs }, "org-1"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(kept).toEqual([]);
  });
});
