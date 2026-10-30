import { describe, expect, test } from "bun:test";
import { createVerify, generateKeyPairSync } from "node:crypto";

import {
  GithubClient,
  GithubNotConfiguredError,
  GithubWriteNotGrantedError,
  githubConfigFromEnv,
} from "./client";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config = {
  appId: "123",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  slug: "aven-test",
  clientId: "Iv1.abc",
  clientSecret: "secret",
  apiUrl: "https://api.github.com",
  webUrl: "https://github.com",
};

type Call = { url: string; init?: RequestInit };

// A GitHub that answers each request from `routes` (keyed "METHOD path") and records the calls.
function fakeGithub(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const path = url.replace("https://api.github.com", "").replace("https://github.com", "");
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in routes)) return new Response("not found", { status: 404 });
    return Response.json(routes[key]);
  };
  return { calls, fetch };
}

const auth = (call: Call) => (call.init!.headers as Record<string, string>).authorization!;

describe("githubConfigFromEnv", () => {
  test("is null until every setting is there, and un-escapes a one-line key", () => {
    expect(githubConfigFromEnv({})).toBeNull();
    expect(githubConfigFromEnv({ GITHUB_APP_ID: "1" })).toBeNull();
    const full = githubConfigFromEnv({
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY: "a\\nb",
      GITHUB_APP_SLUG: "s",
      GITHUB_APP_CLIENT_ID: "c",
      GITHUB_APP_CLIENT_SECRET: "x",
    });
    expect(full?.privateKey).toBe("a\nb");
  });

  test("an unconfigured client refuses to talk to GitHub", async () => {
    const client = new GithubClient(null);
    expect(client.configured).toBe(false);
    await expect(client.listRepos(1)).rejects.toBeInstanceOf(GithubNotConfiguredError);
  });
});

describe("GithubClient", () => {
  test("signs the app JWT with the private key", async () => {
    const github = fakeGithub({
      "GET /app/installations/7": { id: 7, account: { login: "acme" } },
    });
    const client = new GithubClient(config, github.fetch);

    expect(await client.installation(7)).toEqual({ installationId: 7, accountLogin: "acme" });

    const [head, body, signature] = auth(github.calls[0]!).replace("Bearer ", "").split(".");
    expect(JSON.parse(Buffer.from(body!, "base64url").toString())).toMatchObject({ iss: "123" });
    const valid = createVerify("RSA-SHA256")
      .update(`${head}.${body}`)
      .verify(publicKey, Buffer.from(signature!, "base64url"));
    expect(valid).toBe(true);
  });

  test("asks for read-only access and reuses the installation token until it nears expiry", async () => {
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const github = fakeGithub({
      "POST /app/installations/7/access_tokens": { token: "ghs_one", expires_at: expiresAt },
    });
    const client = new GithubClient(config, github.fetch);

    expect((await client.installationToken(7)).token).toBe("ghs_one");
    expect((await client.installationToken(7)).token).toBe("ghs_one");

    expect(github.calls).toHaveLength(1);
    expect(JSON.parse(String(github.calls[0]!.init?.body))).toEqual({
      permissions: { contents: "read", metadata: "read" },
    });
  });

  test("lists repositories with the installation token", async () => {
    const github = fakeGithub({
      "POST /app/installations/7/access_tokens": {
        token: "ghs_one",
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
      "GET /installation/repositories?per_page=100&page=1": {
        repositories: [
          {
            id: 1,
            full_name: "acme/web",
            private: true,
            default_branch: "main",
            clone_url: "https://github.com/acme/web.git",
            description: null,
          },
        ],
      },
    });
    const client = new GithubClient(config, github.fetch);

    expect(await client.listRepos(7)).toEqual([
      {
        id: 1,
        fullName: "acme/web",
        private: true,
        defaultBranch: "main",
        cloneUrl: "https://github.com/acme/web.git",
        description: null,
      },
    ]);
    expect(auth(github.calls.at(-1)!)).toBe("Bearer ghs_one");
  });

  test("a repository the installation cannot see is null, not an error", async () => {
    const github = fakeGithub({
      "POST /app/installations/7/access_tokens": {
        token: "ghs_one",
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });
    expect(await new GithubClient(config, github.fetch).repo(7, "acme/secret")).toBeNull();
  });

  test("a user may use an installation only if GitHub lists it among theirs", async () => {
    const github = fakeGithub({
      "POST /login/oauth/access_token": { access_token: "ghu_user" },
      "GET /user/installations?per_page=100&page=1": { installations: [{ id: 7 }] },
    });
    const client = new GithubClient(config, github.fetch);

    expect(await client.userCanUse("code", 7)).toBe(true);
    expect(await client.userCanUse("code", 8)).toBe(false);
  });

  test("a code GitHub does not accept means no access", async () => {
    const github = fakeGithub({
      "POST /login/oauth/access_token": { error: "bad_verification_code" },
    });
    expect(await new GithubClient(config, github.fetch).userCanUse("bad", 7)).toBe(false);
  });
});

describe("writing to a repository", () => {
  const tokens = "POST /app/installations/7/access_tokens";
  const input = {
    fullName: "acme/app",
    head: "aven/abc12345",
    base: "main",
    title: "Add a thing",
    body: "Why",
    draft: true,
  };
  const open = "GET /repos/acme/app/pulls?state=open&head=acme%3Aaven%2Fabc12345";

  test("a write token is for one repository and one permission, and is never reused", async () => {
    const github = fakeGithub({ [tokens]: { token: "ghs_w", expires_at: "2099-01-01T00:00:00Z" } });
    const client = new GithubClient(config, github.fetch);

    expect(await client.writeToken(7, "acme/app", "contents")).toBe("ghs_w");
    await client.writeToken(7, "acme/app", "contents");

    expect(github.calls).toHaveLength(2);
    expect(JSON.parse(String(github.calls[0]!.init?.body))).toEqual({
      repositories: ["app"],
      permissions: { contents: "write", metadata: "read" },
    });
  });

  test("an installation that has not approved the permission is a conflict that says so", async () => {
    const fetch = async () => new Response("nope", { status: 422 });
    const client = new GithubClient(config, fetch);

    await expect(client.writeToken(7, "acme/app", "contents")).rejects.toBeInstanceOf(
      GithubWriteNotGrantedError,
    );
  });

  test("opens a draft pull request when none is open for the branch", async () => {
    const github = fakeGithub({
      [tokens]: { token: "ghs_pr", expires_at: "2099-01-01T00:00:00Z" },
      [open]: [],
      "POST /repos/acme/app/pulls": { number: 12, html_url: "https://github.com/acme/app/pull/12" },
    });
    const client = new GithubClient(config, github.fetch);

    expect(await client.openPullRequest(7, input)).toEqual({
      number: 12,
      url: "https://github.com/acme/app/pull/12",
      created: true,
    });

    const create = github.calls.at(-1)!;
    expect(auth(create)).toBe("Bearer ghs_pr");
    expect(JSON.parse(String(create.init?.body))).toEqual({
      title: "Add a thing",
      head: "aven/abc12345",
      base: "main",
      body: "Why",
      draft: true,
    });
    expect(JSON.parse(String(github.calls[0]!.init?.body)).permissions).toEqual({
      pull_requests: "write",
      metadata: "read",
    });
  });

  test("a pull request already open for the branch is returned, not duplicated or edited", async () => {
    const github = fakeGithub({
      [tokens]: { token: "ghs_pr", expires_at: "2099-01-01T00:00:00Z" },
      [open]: [{ number: 9, html_url: "https://github.com/acme/app/pull/9" }],
    });
    const client = new GithubClient(config, github.fetch);

    expect(await client.openPullRequest(7, input)).toEqual({
      number: 9,
      url: "https://github.com/acme/app/pull/9",
      created: false,
    });
    expect(github.calls.map((call) => call.init?.method ?? "GET")).toEqual(["POST", "GET"]);
  });
});
