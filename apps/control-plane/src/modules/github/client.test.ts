import { describe, expect, test } from "bun:test";
import { createVerify, generateKeyPairSync } from "node:crypto";

import {
  GithubClient,
  GithubNotConfiguredError,
  githubConfigFromEnv,
  README_MAX_CHARS,
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

  describe("a repository's folders and README (decision 0082)", () => {
    const token = {
      "POST /app/installations/7/access_tokens": {
        token: "ghs_one",
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
    };

    test("a folder lists its folders first, then its files, each in order of name", async () => {
      const github = fakeGithub({
        ...token,
        "GET /repos/acme/web/contents": [
          { name: "README.md", path: "README.md", type: "file" },
          { name: "src", path: "src", type: "dir" },
          { name: "app.ts", path: "app.ts", type: "file" },
          { name: "Docs", path: "Docs", type: "dir" },
          { name: "vendor", path: "vendor", type: "submodule" },
        ],
      });
      const client = new GithubClient(config, github.fetch);

      expect(await client.folder(7, "acme/web", "")).toEqual([
        { name: "Docs", path: "Docs", type: "directory" },
        { name: "src", path: "src", type: "directory" },
        { name: "app.ts", path: "app.ts", type: "file" },
        { name: "README.md", path: "README.md", type: "file" },
        { name: "vendor", path: "vendor", type: "file" },
      ]);
      // With the installation's token, and the default branch because no ref is asked for.
      expect(auth(github.calls.at(-1)!)).toBe("Bearer ghs_one");
      expect(github.calls.at(-1)!.url).toBe("https://api.github.com/repos/acme/web/contents");
    });

    test("a path is put in the URL one segment at a time", async () => {
      const github = fakeGithub({
        ...token,
        "GET /repos/acme/web/contents/my%20docs/a%3Fb": [],
      });
      const client = new GithubClient(config, github.fetch);

      expect(await client.folder(7, "acme/web", "my docs/a?b")).toEqual([]);
    });

    test("a file, or a path or repository that is not there, is not a folder", async () => {
      const github = fakeGithub({
        ...token,
        "GET /repos/acme/web/contents/app.ts": { name: "app.ts", path: "app.ts", type: "file" },
      });
      const client = new GithubClient(config, github.fetch);

      expect(await client.folder(7, "acme/web", "app.ts")).toBeNull();
      expect(await client.folder(7, "acme/web", "missing")).toBeNull();
      expect(await client.folder(7, "acme/gone", "")).toBeNull();
    });

    test("a README is read as text, and cut when it is very long", async () => {
      const long = "x".repeat(README_MAX_CHARS + 5);
      const github = fakeGithub({
        ...token,
        "GET /repos/acme/web/readme": {
          name: "README.md",
          path: "README.md",
          encoding: "base64",
          content: Buffer.from("# Web\n\nHello ✓").toString("base64"),
        },
        "GET /repos/acme/long/readme": {
          name: "README.md",
          path: "README.md",
          encoding: "base64",
          content: Buffer.from(long).toString("base64"),
        },
      });
      const client = new GithubClient(config, github.fetch);

      expect(await client.readme(7, "acme/web")).toEqual({
        name: "README.md",
        path: "README.md",
        text: "# Web\n\nHello ✓",
        truncated: false,
      });
      const cut = await client.readme(7, "acme/long");
      expect(cut?.text).toHaveLength(README_MAX_CHARS);
      expect(cut?.truncated).toBe(true);
    });

    test("a repository with no README, or one GitHub does not inline, has none", async () => {
      const github = fakeGithub({
        ...token,
        "GET /repos/acme/big/readme": { name: "README.md", path: "README.md", encoding: "none" },
      });
      const client = new GithubClient(config, github.fetch);

      expect(await client.readme(7, "acme/none")).toBeNull();
      expect(await client.readme(7, "acme/big")).toBeNull();
    });
  });

  describe("a repository's commits", () => {
    const token = new Response(
      JSON.stringify({
        token: "ghs_one",
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
    const commit = (sha: string, message: string, extra: object = {}) => ({
      sha,
      commit: { message, author: { name: "Ada", date: "2026-11-01T10:00:00Z" } },
      author: { login: "ada" },
      parents: [],
      ...extra,
    });
    // A GitHub that answers the commits listing with `answer` and the branch listing with
    // `branches`, and the token as the app asks.
    const github = (
      answer: () => Response,
      branches: () => Response = () => Response.json([]),
      // One branch by name; by default found in the listing.
      branch?: (name: string) => Response,
    ) => {
      const calls: string[] = [];
      const fetch = async (url: string) => {
        calls.push(url);
        if (url.includes("/access_tokens")) return token.clone();
        const one = url.match(/\/branches\/([^?]+)$/)?.[1];
        if (one && branch) return branch(one);
        if (one) {
          const listing = branches();
          if (!listing.ok) return listing;
          const found = ((await listing.json()) as { name: string }[]).find((b) => b.name === one);
          return found ? Response.json(found) : new Response("none", { status: 404 });
        }
        return url.includes("/branches") ? branches() : answer();
      };
      return { calls, client: new GithubClient(config, fetch) };
    };

    test("a page is the first line of each message, who wrote it and when, newest first", async () => {
      const { calls, client } = github(() =>
        Response.json([
          commit("a1", "Fix the build\n\nA long body that is not shown."),
          commit("b2", "  Spaced  "),
          {
            ...commit("c3", "By login"),
            commit: { message: "By login", author: null },
            parents: [],
          },
          {
            sha: "d4",
            commit: {
              message: "x".repeat(300),
              author: { name: "Bo", date: "2026-10-31T10:00:00Z" },
            },
            author: null,
            parents: [],
          },
        ]),
      );

      const page = await client.commits(7, "acme/web", 2, "main");

      expect(
        page?.commits.map(({ sha, message, author }) => [sha, message.length, author]),
      ).toEqual([
        ["a1", 13, "Ada"],
        ["b2", 6, "Ada"],
        ["c3", 8, "ada"],
        ["d4", 200, "Bo"],
      ]);
      expect(page?.commits[0]).toEqual({
        sha: "a1",
        message: "Fix the build",
        author: "Ada",
        date: "2026-11-01T10:00:00Z",
        parents: [],
        refs: [],
      });
      expect(calls.at(-1)).toBe("https://api.github.com/repos/acme/web/commits?per_page=10&page=2");
    });

    test("each commit says which commits it follows, and which branches end on it", async () => {
      const { calls, client } = github(
        () =>
          Response.json([
            commit("m1", "Merge", { parents: [{ sha: "b2" }, { sha: "f3" }] }),
            commit("b2", "Main", { parents: [{ sha: "a0" }] }),
            commit("f3", "Feature", { parents: [{ sha: "a0" }] }),
          ]),
        () =>
          Response.json([
            { name: "main", commit: { sha: "m1" } },
            { name: "release", commit: { sha: "m1" } },
            { name: "feature/login", commit: { sha: "f3" } },
            // A branch that ends on a commit this page does not have.
            { name: "old", commit: { sha: "zzz" } },
          ]),
      );

      const page = await client.commits(7, "acme/web", 1, "main");

      expect(page?.commits.map(({ sha, parents, refs }) => [sha, parents, refs])).toEqual([
        ["m1", ["b2", "f3"], ["main", "release"]],
        ["b2", ["a0"], []],
        ["f3", ["a0"], ["feature/login"]],
      ]);
      expect(calls.some((url) => url.endsWith("/repos/acme/web/branches?per_page=100"))).toBe(true);
    });

    test("the default branch is shown even when it is past the branches GitHub lists first", async () => {
      // GitHub lists branches by name, 100 to a page: `main` can be on a later page, so it is also
      // asked for by its own name.
      const { calls, client } = github(
        () => Response.json([commit("a1", "Fix", { parents: [] })]),
        () => Response.json([{ name: "zzz", commit: { sha: "a1" } }]),
        (name) => Response.json({ name, commit: { sha: "a1" } }),
      );

      const page = await client.commits(7, "acme/web", 1, "main");

      expect(page?.commits[0]?.refs).toEqual(["zzz", "main"]);
      expect(calls.some((url) => url.endsWith("/repos/acme/web/branches/main"))).toBe(true);
    });

    test("branch names that cannot be had leave the page as it is, with none", async () => {
      const { client } = github(
        () => Response.json([commit("a1", "Fix", { parents: [{ sha: "a0" }] })]),
        () => new Response("boom", { status: 500 }),
      );

      expect((await client.commits(7, "acme/web", 1, "main"))?.commits[0]).toMatchObject({
        sha: "a1",
        parents: ["a0"],
        refs: [],
      });
    });

    test("there is an older page only when GitHub links to one", async () => {
      const more = github(
        () =>
          new Response("[]", {
            headers: {
              link: '<https://api.github.com/x?page=3>; rel="next", <https://api.github.com/x?page=9>; rel="last"',
            },
          }),
      );
      expect((await more.client.commits(7, "acme/web", 2, "main"))?.hasMore).toBe(true);

      const last = github(
        () =>
          new Response("[]", {
            headers: { link: '<https://api.github.com/x?page=1>; rel="prev"' },
          }),
      );
      expect((await last.client.commits(7, "acme/web", 3, "main"))?.hasMore).toBe(false);
      expect(
        (await github(() => Response.json([])).client.commits(7, "acme/web", 1, "main"))?.hasMore,
      ).toBe(false);
    });

    test("a repository with no commit is an empty page, and one that is not seen is null", async () => {
      expect(
        await github(() => new Response("empty", { status: 409 })).client.commits(
          7,
          "acme/new",
          1,
          "main",
        ),
      ).toEqual({ commits: [], hasMore: false });
      expect(
        await github(() => new Response("gone", { status: 404 })).client.commits(
          7,
          "acme/gone",
          1,
          "main",
        ),
      ).toBeNull();
      await expect(
        github(() => new Response("boom", { status: 500 })).client.commits(
          7,
          "acme/web",
          1,
          "main",
        ),
      ).rejects.toThrow("GitHub answered 500");
    });
  });

  test("a user may use an installation only if GitHub lists it among theirs", async () => {
    const github = fakeGithub({
      "GET /user/installations?per_page=100&page=1": { installations: [{ id: 7 }] },
    });
    const client = new GithubClient(config, github.fetch);

    expect(await client.userCanUse("ghu_user", 7)).toBe(true);
    expect(await client.userCanUse("ghu_user", 8)).toBe(false);
    expect(auth(github.calls[0]!)).toBe("Bearer ghu_user");
  });
});

describe("a person's GitHub token", () => {
  const oauth = "POST /login/oauth/access_token";
  const body = (call: Call) => JSON.parse(String(call.init?.body));

  test("a code becomes a token, with when it and its refresh token expire", async () => {
    const before = Date.now();
    const github = fakeGithub({
      [oauth]: {
        access_token: "ghu_a",
        expires_in: 28800,
        refresh_token: "ghr_a",
        refresh_token_expires_in: 15811200,
      },
    });
    const client = new GithubClient(config, github.fetch);

    const grant = await client.exchangeCode("the-code");

    expect(grant).toMatchObject({ accessToken: "ghu_a", refreshToken: "ghr_a" });
    expect(grant!.expiresAt).toBeGreaterThanOrEqual(before + 28800 * 1000);
    expect(grant!.refreshExpiresAt).toBeGreaterThanOrEqual(before + 15811200 * 1000);
    expect(body(github.calls[0]!)).toEqual({
      client_id: "Iv1.abc",
      client_secret: "secret",
      code: "the-code",
    });
  });

  test("a token of an app whose user tokens do not expire has no expiry and no refresh token", async () => {
    const github = fakeGithub({ [oauth]: { access_token: "ghu_forever" } });

    expect(await new GithubClient(config, github.fetch).exchangeCode("c")).toEqual({
      accessToken: "ghu_forever",
      expiresAt: null,
      refreshToken: null,
      refreshExpiresAt: null,
    });
  });

  test("a code or refresh token GitHub does not accept is no grant", async () => {
    const github = fakeGithub({ [oauth]: { error: "bad_verification_code" } });
    const client = new GithubClient(config, github.fetch);

    expect(await client.exchangeCode("bad")).toBeNull();
    expect(await client.refreshGrant("bad")).toBeNull();
  });

  test("a GitHub that is down, or cannot be reached, is an error and not a refusal", async () => {
    const down = new GithubClient(config, async () => new Response("bad gateway", { status: 502 }));
    await expect(down.refreshGrant("ghr_a")).rejects.toThrow("GitHub answered 502");

    const unreachable = new GithubClient(config, async () => {
      throw new TypeError("fetch failed");
    });
    await expect(unreachable.refreshGrant("ghr_a")).rejects.toThrow("Could not reach GitHub");
  });

  test("a refresh token is exchanged for a new grant", async () => {
    const github = fakeGithub({
      [oauth]: { access_token: "ghu_b", refresh_token: "ghr_b", expires_in: 28800 },
    });

    const grant = await new GithubClient(config, github.fetch).refreshGrant("ghr_a");

    expect(grant).toMatchObject({ accessToken: "ghu_b", refreshToken: "ghr_b" });
    expect(body(github.calls[0]!)).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "ghr_a",
    });
  });

  test("reads the person's GitHub account", async () => {
    const github = fakeGithub({ "GET /user": { id: 42, login: "ada", name: "Ada L" } });

    expect(await new GithubClient(config, github.fetch).userProfile("ghu_a")).toEqual({
      id: 42,
      login: "ada",
      name: "Ada L",
    });
  });
});

describe("writing to a repository", () => {
  test("an installation is writable only once both permissions are approved", async () => {
    const github = fakeGithub({
      "GET /app/installations/7": { permissions: { contents: "write", pull_requests: "write" } },
      "GET /app/installations/8": { permissions: { contents: "write", pull_requests: "read" } },
      "GET /app/installations/9": { permissions: { contents: "read", metadata: "read" } },
    });
    const client = new GithubClient(config, github.fetch);

    expect(await client.canWrite(7)).toBe(true);
    expect(await client.canWrite(8)).toBe(false);
    expect(await client.canWrite(9)).toBe(false);
  });

  test("finds the pull requests of a thread's branches with a token that may only read them", async () => {
    const pull = (number: number, ref: string, extra: Record<string, unknown> = {}) => ({
      number,
      html_url: `https://github.com/acme/app/pull/${number}`,
      title: `Pull ${number}`,
      state: "open",
      merged_at: null,
      head: { ref, repo: { full_name: "acme/app" } },
      ...extra,
    });
    const github = fakeGithub({
      "POST /app/installations/7/access_tokens": {
        token: "ghs_read",
        expires_at: "2099-01-01T00:00:00Z",
      },
      "GET /repos/acme/app/pulls?state=all&sort=created&direction=desc&per_page=100": [
        pull(9, "aven/abc12345-docs", { state: "closed", merged_at: "2026-01-01T00:00:00Z" }),
        pull(8, "aven/abc123456789"),
        pull(7, "aven/other-docs"),
        pull(6, "aven/abc12345-fork", {
          head: { ref: "aven/abc12345-fork", repo: { full_name: "me/app" } },
        }),
        pull(5, "aven/abc12345-gone", { head: { ref: "aven/abc12345-gone", repo: null } }),
        pull(4, "aven/abc12345", { state: "closed" }),
      ],
    });
    const client = new GithubClient(config, github.fetch);

    expect(await client.findPullRequests(7, "acme/app", "aven/abc12345")).toEqual([
      {
        number: 9,
        url: "https://github.com/acme/app/pull/9",
        title: "Pull 9",
        branch: "aven/abc12345-docs",
        state: "merged",
      },
      {
        number: 4,
        url: "https://github.com/acme/app/pull/4",
        title: "Pull 4",
        branch: "aven/abc12345",
        state: "closed",
      },
    ]);

    expect(JSON.parse(String(github.calls[0]!.init?.body))).toEqual({
      repositories: ["app"],
      permissions: { pull_requests: "read", metadata: "read" },
    });
    expect(auth(github.calls[1]!)).toBe("Bearer ghs_read");
  });

  test("a thread with no pull request, or an installation that cannot read them, has none", async () => {
    const empty = fakeGithub({
      "POST /app/installations/7/access_tokens": {
        token: "ghs_read",
        expires_at: "2099-01-01T00:00:00Z",
      },
      "GET /repos/acme/app/pulls?state=all&sort=created&direction=desc&per_page=100": [],
    });
    expect(
      await new GithubClient(config, empty.fetch).findPullRequests(7, "acme/app", "aven/none"),
    ).toEqual([]);

    const refused = new GithubClient(config, async () => new Response("no", { status: 422 }));
    expect(await refused.findPullRequests(7, "acme/app", "aven/x")).toEqual([]);
  });

  test("a person can push only when GitHub says so for their token; a repository they cannot see is no", async () => {
    const github = fakeGithub({
      "GET /repos/acme/app": { permissions: { push: true } },
      "GET /repos/acme/read-only": { permissions: { push: false } },
    });
    const client = new GithubClient(config, github.fetch);

    expect(await client.canPush("ghu_a", "acme/app")).toBe(true);
    expect(await client.canPush("ghu_a", "acme/read-only")).toBe(false);
    expect(await client.canPush("ghu_a", "acme/hidden")).toBe(false);
    expect(auth(github.calls[0]!)).toBe("Bearer ghu_a");
  });
});
