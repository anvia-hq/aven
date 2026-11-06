import { describe, expect, test } from "bun:test";

import type { GithubClient, GithubConfig } from "./client";
import { createGithubClients, GithubAppNotFoundError, PLATFORM_APP } from "./clients";

const config = (slug: string) => ({ slug }) as GithubConfig;

function setup(apps: Record<string, string> = {}) {
  const platform = { name: "platform" } as unknown as GithubClient;
  const made: string[] = [];
  const clients = createGithubClients(
    platform,
    {
      byOrganization: async (organizationId) =>
        apps[organizationId]
          ? { id: `app-of-${organizationId}`, config: config(apps[organizationId]!) }
          : null,
      byId: async (id) => {
        const organizationId = id.replace("app-of-", "");
        return apps[organizationId] ? { id, config: config(apps[organizationId]!) } : null;
      },
    },
    (given) => {
      made.push(given.slug);
      return { name: given.slug } as unknown as GithubClient;
    },
  );
  return { clients, platform, made };
}

describe("the GitHub clients (decision 0123)", () => {
  test("a workspace without an app of its own acts as the platform's", async () => {
    const { clients, platform, made } = setup();
    expect(await clients.forOrganization("org-1")).toEqual({ key: PLATFORM_APP, client: platform });
    expect(await clients.forKey(PLATFORM_APP)).toBe(platform);
    expect(made).toEqual([]);
  });

  test("a workspace with one acts as it, with one client kept for it", async () => {
    const { clients, platform, made } = setup({ "org-1": "acme-aven" });
    const first = await clients.forOrganization("org-1");
    expect(first.key).toBe("app-of-org-1");
    expect(first.client).not.toBe(platform);
    expect((await clients.forOrganization("org-1")).client).toBe(first.client);
    expect(await clients.forKey("app-of-org-1")).toBe(first.client);
    expect(made).toEqual(["acme-aven"]);
    // Another workspace is not given it.
    expect((await clients.forOrganization("org-2")).client).toBe(platform);
  });

  test("an app that is not there is refused, and a forgotten one is read again", async () => {
    const apps: Record<string, string> = {};
    const { clients, platform } = setup(apps);
    await expect(clients.forKey("app-of-org-1")).rejects.toBeInstanceOf(GithubAppNotFoundError);
    expect((await clients.forOrganization("org-1")).client).toBe(platform);
    apps["org-1"] = "acme-aven";
    clients.forget("org-1");
    expect((await clients.forOrganization("org-1")).key).toBe("app-of-org-1");
  });
});
