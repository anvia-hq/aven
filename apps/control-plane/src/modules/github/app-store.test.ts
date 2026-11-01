import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { eq } from "drizzle-orm";

import { loadGithubApp, saveGithubApp, useStoredGithubApp } from "./app-store";
import type { GithubConfig } from "./client";

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
