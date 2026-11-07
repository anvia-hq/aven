import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { githubApps } from "@aven/db/schema/github-apps";
import { organizations } from "@aven/db/schema/organizations";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { users } from "@aven/db/schema/users";
import { eq, inArray } from "drizzle-orm";

import {
  loadAppById,
  loadGithubApp,
  loadOrganizationApp,
  saveGithubApp,
  saveOrganizationApp,
  useStoredGithubApp,
} from "./app-store";
import type { GithubConfig } from "./types";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const urls = { apiUrl: "https://api.github.test", webUrl: "https://github.test" };
const app: GithubConfig = {
  appId: "7",
  privateKey: "-----BEGIN-----\nk\n-----END-----\n",
  slug: "aven-x",
  clientId: "Iv1.c",
  clientSecret: "topsecret",
  ...urls,
};

run("the kept GitHub App (real postgres)", () => {
  afterAll(() => db.delete(platformSettings).where(eq(platformSettings.key, "github_app")));

  test("is kept encrypted and read back with the environment's URLs", async () => {
    await saveGithubApp(app);
    const [row] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, "github_app"));
    expect(row!.value).not.toContain("topsecret");
    expect(row!.value).not.toContain("aven-x");
    expect(await loadGithubApp(urls)).toEqual(app);
  });

  test("a second app replaces the first", async () => {
    await saveGithubApp({ ...app, slug: "aven-y" });
    expect((await loadGithubApp(urls))?.slug).toBe("aven-y");
  });

  test("is not read when it was encrypted with another key", async () => {
    await db
      .update(platformSettings)
      .set({ value: "AAAA.AAAA.AAAA" })
      .where(eq(platformSettings.key, "github_app"));
    const log = console.error;
    console.error = () => {};
    try {
      expect(await loadGithubApp(urls)).toBeNull();
    } finally {
      console.error = log;
    }
  });
});

run("starting with a kept app (real postgres)", () => {
  afterAll(() => db.delete(platformSettings).where(eq(platformSettings.key, "github_app")));

  const fakeClient = (configured: boolean) => {
    const configs: (GithubConfig | null)[] = [];
    return {
      configs,
      client: {
        configured,
        configure: (config: GithubConfig | null) => configs.push(config),
      },
    };
  };

  test("the environment's app wins over the kept one", async () => {
    await saveGithubApp(app);
    const { client, configs } = fakeClient(true);
    await useStoredGithubApp(client);
    expect(configs).toEqual([]);
  });

  test("otherwise the kept one is used", async () => {
    await saveGithubApp(app);
    const { client, configs } = fakeClient(false);
    await useStoredGithubApp(client);
    expect(configs).toHaveLength(1);
    expect(configs[0]?.appId).toBe("7");
  });
});

run("a workspace's own GitHub App (real postgres)", () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const userId = `u-app-${suffix}`;
  const orgA = `org-a-${suffix}`;
  const orgB = `org-b-${suffix}`;

  beforeAll(async () => {
    await db.insert(users).values({ id: userId, name: "Ada", email: `${userId}@aven.test` });
    await db.insert(organizations).values([
      { id: orgA, name: "A", slug: orgA },
      { id: orgB, name: "B", slug: orgB },
    ]);
  });

  afterAll(async () => {
    await db.delete(githubApps).where(eq(githubApps.createdBy, userId));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(users).where(eq(users.id, userId));
  });

  test("is kept encrypted for its workspace alone and read back with the environment's URLs", async () => {
    const id = await saveOrganizationApp(orgA, userId, app);
    const [row] = await db.select().from(githubApps).where(eq(githubApps.id, id));
    expect(row!.credentialsEncrypted).not.toContain("topsecret");
    expect(row!.slug).toBe("aven-x");
    expect(await loadOrganizationApp(orgA, urls)).toEqual({ id, config: app });
    expect(await loadAppById(id, urls)).toEqual({ id, organizationId: orgA, config: app });
    expect(await loadOrganizationApp(orgB, urls)).toBeNull();
  });

  test("a second app of the workspace is refused and the first is kept", async () => {
    const first = (await loadOrganizationApp(orgA, urls))!;
    await expect(saveOrganizationApp(orgA, userId, { ...app, slug: "aven-y" })).rejects.toThrow(
      "already has its own",
    );
    expect(await loadOrganizationApp(orgA, urls)).toEqual(first);
  });
});
