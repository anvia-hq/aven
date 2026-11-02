import { describe, expect, test } from "bun:test";

import {
  appManifest,
  convertManifest,
  createSetupState,
  githubUrlsFromEnv,
  newAppUrl,
  readSetupState,
} from "./app-manifest";

const urls = { apiUrl: "https://api.github.com", webUrl: "https://github.com" };

describe("appManifest", () => {
  test("asks for what the agent needs, with the callbacks on the origin", () => {
    const manifest = appManifest("https://aven.example.com/", "Aven");
    expect(manifest.redirect_url).toBe("https://aven.example.com/api/github/app/callback");
    expect(manifest.callback_urls).toEqual(["https://aven.example.com/api/github/callback"]);
    expect(manifest.request_oauth_on_install).toBe(true);
    expect(manifest.default_permissions).toMatchObject({
      contents: "write",
      pull_requests: "write",
      issues: "read",
      metadata: "read",
    });
    expect(manifest.default_events).toEqual([]);
  });

  test("is private unless asked to be public, which lets any account install it", () => {
    expect(appManifest("https://aven.example.com", "Aven").public).toBe(false);
    expect(appManifest("https://aven.example.com", "Aven", true).public).toBe(true);
  });
});

describe("newAppUrl", () => {
  test("posts to the person's settings, or an organization's", () => {
    expect(newAppUrl(urls, "a b")).toBe("https://github.com/settings/apps/new?state=a%20b");
    expect(newAppUrl(urls, "s", "acme corp")).toBe(
      "https://github.com/organizations/acme%20corp/settings/apps/new?state=s",
    );
  });

  test("github.com unless the environment says otherwise", () => {
    expect(githubUrlsFromEnv({})).toEqual(urls);
    expect(githubUrlsFromEnv({ GITHUB_WEB_URL: "https://ghe.example.com" }).webUrl).toBe(
      "https://ghe.example.com",
    );
  });
});

describe("the setup state", () => {
  test("is good for the person it was made for, within the hour", () => {
    const state = createSetupState("u1", 1_000);
    expect(readSetupState(state, "u1", 1_000 + 59 * 60_000)).toBe(true);
    expect(readSetupState(state, "u1", 1_000 + 61 * 60_000)).toBe(false);
    expect(readSetupState(state, "u2", 2_000)).toBe(false);
  });

  test("refuses a state that was changed or is not one", () => {
    const [payload, signature] = createSetupState("u1", 1_000).split(".");
    const other = Buffer.from(JSON.stringify(["u2", 1_000])).toString("base64url");
    expect(readSetupState(`${other}.${signature}`, "u2", 2_000)).toBe(false);
    expect(readSetupState(`${payload}.x`, "u1", 2_000)).toBe(false);
    expect(readSetupState("nonsense", "u1", 2_000)).toBe(false);
  });
});

describe("convertManifest", () => {
  const created = {
    id: 42,
    slug: "aven-acme",
    client_id: "Iv1.x",
    client_secret: "shh",
    pem: "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\n",
  };

  test("turns the code into the app's credentials, asking GitHub without any authorization", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const config = await convertManifest("c0de", urls, async (url, init) => {
      calls.push({ url, init });
      return Response.json(created, { status: 201 });
    });
    expect(calls[0]!.url).toBe("https://api.github.com/app-manifests/c0de/conversions");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(config).toEqual({
      appId: "42",
      privateKey: created.pem,
      slug: "aven-acme",
      clientId: "Iv1.x",
      clientSecret: "shh",
      ...urls,
    });
  });

  test("fails when GitHub refuses the code or leaves out a credential", async () => {
    await expect(
      convertManifest("c", urls, async () => new Response("", { status: 404 })),
    ).rejects.toThrow("404");
    await expect(
      convertManifest("c", urls, async () => Response.json({ ...created, pem: "" })),
    ).rejects.toThrow("missing its credentials");
  });
});
