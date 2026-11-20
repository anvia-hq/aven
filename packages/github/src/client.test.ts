import { describe, expect, test } from "bun:test";
import { createVerify, generateKeyPairSync } from "node:crypto";

import { UnavailableError } from "@aven/server-kit/errors";
import {
  GithubApiError,
  GithubClient,
  GithubCreateNotGrantedError,
  GithubIssuesNotGrantedError,
  GithubNotConfiguredError,
  GithubRepositoryNotCreatedError,
  GithubUserRequiredError,
  githubConfigFromEnv,
  README_MAX_CHARS,
  trackedQualifiers,
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
    await expect(client.folder(1, "acme/web", "")).rejects.toBeInstanceOf(GithubNotConfiguredError);
  });
});

describe("trackedQualifiers", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");

  test("turns each filter into one search qualifier", () => {
    expect(
      trackedQualifiers(
        {
          author: "ada",
          reviewRequested: "grace",
          review: "required",
          checks: "failure",
          label: "good first issue",
          draft: false,
          staleDays: 7,
          text: "login",
        },
        now,
      ),
    ).toEqual([
      "author:ada",
      "review-requested:grace",
      "review:required",
      "status:failure",
      'label:"good first issue"',
      "draft:false",
      "updated:<2026-11-03",
      "login in:title",
    ]);
  });

  test("lets no text or label make a qualifier of its own", () => {
    expect(trackedQualifiers({ text: 'x repo:other/secret "y"', label: 'a" repo:o/p' })).toEqual([
      'label:"a repo:o/p"',
      "x repo other/secret  y in:title",
    ]);
  });
});

describe("GithubClient", () => {
  test("signs the app JWT with the private key", async () => {
    const github = fakeGithub({
      "GET /app/installations/7": { id: 7, account: { login: "acme" } },
    });
    const client = new GithubClient(config, github.fetch);

    expect(await client.installation(7)).toEqual({
      installationId: 7,
      accountLogin: "acme",
      accountType: "user",
      selectedRepositories: false,
      canCreateRepositories: false,
    });

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

    test("a file is read as text, cut at the limit, and a folder or binary file is not one", async () => {
      const encode = (text: string) => Buffer.from(text).toString("base64");
      const github = fakeGithub({
        ...token,
        "GET /repos/acme/web/contents/app.ts": {
          type: "file",
          path: "app.ts",
          encoding: "base64",
          content: encode("abcdefghij"),
        },
        "GET /repos/acme/web/contents/logo.png": {
          type: "file",
          path: "logo.png",
          encoding: "base64",
          content: encode("PNG\u0000data"),
        },
        "GET /repos/acme/web/contents/src": [{ name: "a.ts", path: "src/a.ts", type: "file" }],
      });
      const client = new GithubClient(config, github.fetch);

      expect(await client.file(7, "acme/web", "app.ts", 4)).toEqual({
        path: "app.ts",
        text: "abcd",
        truncated: true,
      });
      expect(await client.file(7, "acme/web", "app.ts", 100)).toEqual({
        path: "app.ts",
        text: "abcdefghij",
        truncated: false,
      });
      expect(await client.file(7, "acme/web", "logo.png", 100)).toBeNull();
      expect(await client.file(7, "acme/web", "src", 100)).toBeNull();
      expect(await client.file(7, "acme/web", "missing.ts", 100)).toBeNull();
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
    const github = (
      answer: () => Response,
      branches: () => Response = () => Response.json([]),
      branch?: (name: string) => Response,
      tags: () => Response = () => Response.json([]),
    ) => {
      const calls: string[] = [];
      const fetch = async (url: string) => {
        calls.push(url);

        if (url.includes("/access_tokens")) return token.clone();

        if (url.includes("/tags?")) return tags();

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
        authorAvatar: null,
        date: "2026-11-01T10:00:00Z",
        parents: [],
        refs: [],
        tags: [],
      });
      expect(calls).toContain("https://api.github.com/repos/acme/web/commits?per_page=10&page=2");
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

    test("a commit says which tags name it, and a repository whose tags cannot be had shows none", async () => {
      const tagged = github(
        () => Response.json([commit("a1", "Release 1.0", { parents: [] })]),
        () => Response.json([]),
        undefined,
        () =>
          Response.json([
            { name: "v1.0", commit: { sha: "a1" } },
            { name: "latest", commit: { sha: "a1" } },
          ]),
      );
      expect((await tagged.client.commits(7, "acme/web", 1, "main"))?.commits[0]?.tags).toEqual([
        "v1.0",
        "latest",
      ]);

      const failing = github(
        () => Response.json([commit("a1", "Release 1.0", { parents: [] })]),
        () => Response.json([]),
        undefined,
        () => new Response("boom", { status: 500 }),
      );
      expect((await failing.client.commits(7, "acme/web", 1, "main"))?.commits[0]?.tags).toEqual(
        [],
      );
    });

    test("the default branch is shown even when it is past the branches GitHub lists first", async () => {
      const { calls, client } = github(
        () => Response.json([commit("a1", "Fix", { parents: [] })]),
        () => Response.json([{ name: "zzz", commit: { sha: "a1" } }]),
        (name) => Response.json({ name, commit: { sha: "a1" } }),
      );

      const page = await client.commits(7, "acme/web", 1, "main");

      expect(page?.commits[0]?.refs).toEqual(["zzz", "main"]);
      expect(calls.some((url) => url.endsWith("/repos/acme/web/branches/main"))).toBe(true);
    });

    test("asks for the history of one author, time, file and branch when the filters say so", async () => {
      const { calls, client } = github(() => Response.json([]));

      await client.commits(7, "acme/web", 1, "main", {
        author: "ada",
        since: "2026-11-01T00:00:00Z",
        until: "2026-11-09T00:00:00Z",
        path: "src/a.ts",
        branch: "feature/login",
      });

      const search = new URL(calls.find((url) => url.includes("/commits?"))!).searchParams;
      expect(Object.fromEntries(search)).toEqual({
        per_page: "10",
        page: "1",
        author: "ada",
        since: "2026-11-01T00:00:00Z",
        until: "2026-11-09T00:00:00Z",
        path: "src/a.ts",
        sha: "feature/login",
      });
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

  describe("a repository's pull requests and issues (decision 0092)", () => {
    const item = (number: number, extra: object = {}) => ({
      number,
      title: `Item ${number}`,
      html_url: `https://github.com/acme/web/pull/${number}`,
      state: "open",
      comments: 2,
      updated_at: "2026-11-01T10:00:00Z",
      user: { login: "ada" },
      ...extra,
    });
    const github = (
      answer: (query: URLSearchParams) => Response,
      permissions: Record<string, string> = { pull_requests: "write", issues: "read" },
    ) => {
      const calls: string[] = [];
      const fetch = async (url: string, init?: RequestInit) => {
        calls.push(url);

        if (url.includes("/access_tokens")) {
          return Response.json({
            token: "ghs_one",
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          });
        }

        if (url.endsWith("/app/installations/7")) {
          return Response.json({ permissions, account: { login: "acme" } });
        }

        void init;
        return answer(new URL(url).searchParams);
      };
      return { calls, client: new GithubClient(config, fetch) };
    };

    test("a pull request is draft, open, merged or closed, with who made it and when it changed", async () => {
      const { calls, client } = github(() =>
        Response.json({
          total_count: 4,
          items: [
            item(4, { draft: true }),
            item(3),
            item(2, { state: "closed", pull_request: { merged_at: "2026-10-30T10:00:00Z" } }),
            item(1, { state: "closed", pull_request: { merged_at: null }, user: null }),
          ],
        }),
      );

      const page = await client.tracked(7, "acme/web", "pull", "open", 1);

      expect(page?.items.map(({ number, status, author }) => [number, status, author])).toEqual([
        [4, "draft", "ada"],
        [3, "open", "ada"],
        [2, "merged", "ada"],
        [1, "closed", null],
      ]);
      expect(page?.items[1]).toEqual({
        number: 3,
        title: "Item 3",
        url: "https://github.com/acme/web/pull/3",
        author: "ada",
        status: "open",
        comments: 2,
        updatedAt: "2026-11-01T10:00:00Z",
        labels: [],
      });
      const search = new URL(calls.at(-1)!).searchParams;
      expect(search.get("q")).toBe("repo:acme/web is:pr is:open");
      expect(search.get("sort")).toBe("updated");
      expect(search.get("per_page")).toBe("10");
      expect(calls.some((url) => url.endsWith("/app/installations/7"))).toBe(false);
    });

    test("an issue is open or closed, and closed is asked for as closed", async () => {
      const { calls, client } = github(() =>
        Response.json({ total_count: 1, items: [item(9, { state: "closed" })] }),
      );

      const page = await client.tracked(7, "acme/web", "issue", "closed", 1);

      expect(page?.items.map(({ number, status }) => [number, status])).toEqual([[9, "closed"]]);
      expect(new URL(calls.at(-1)!).searchParams.get("q")).toBe("repo:acme/web is:issue is:closed");
    });

    test("there is a later page while the matches go past this one, and never past the thousandth", async () => {
      const total = (count: number, page: number) =>
        github(() => Response.json({ total_count: count, items: [] })).client.tracked(
          7,
          "acme/web",
          "pull",
          "open",
          page,
        );

      expect((await total(25, 2))?.hasMore).toBe(true);
      expect((await total(20, 2))?.hasMore).toBe(false);
      expect((await total(0, 1))?.hasMore).toBe(false);
      expect((await total(5000, 100))?.hasMore).toBe(false);
      expect((await total(5000, 99))?.hasMore).toBe(true);
      expect((await total(25, 2))?.total).toBe(25);
    });

    test("issues are not listed, and the page says why, when the app is not approved to read them", async () => {
      const { calls, client } = github(() => Response.json({ total_count: 0, items: [] }), {
        pull_requests: "write",
      });

      await expect(client.tracked(7, "acme/web", "issue", "open", 1)).rejects.toBeInstanceOf(
        GithubIssuesNotGrantedError,
      );
      expect(calls.some((url) => url.includes("/search/issues"))).toBe(false);
      expect((await client.tracked(7, "acme/web", "pull", "open", 1))?.total).toBe(0);
    });

    test("a repository that is not seen is null, a page past what search gives is empty, anything else is an error", async () => {
      const refused = github(() => new Response("no", { status: 422 }));
      expect(await refused.client.tracked(7, "acme/gone", "pull", "open", 1)).toBeNull();
      expect(await refused.client.tracked(7, "acme/gone", "pull", "open", 2)).toEqual({
        items: [],
        total: 0,
        hasMore: false,
      });
      await expect(
        github(() => new Response("limit", { status: 403 })).client.tracked(
          7,
          "acme/web",
          "pull",
          "open",
          1,
        ),
      ).rejects.toThrow("GitHub answered 403");
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

  describe("a repository the app makes", () => {
    const created = {
      id: 9,
      full_name: "acme/app",
      clone_url: "https://github.com/acme/app.git",
      default_branch: "main",
      private: true,
    };

    test("is created in an organization with a token that may administer it, with a README", async () => {
      const github = fakeGithub({
        "POST /app/installations/7/access_tokens": { token: "ghs_admin" },
        "POST /orgs/acme/repos": created,
      });
      const client = new GithubClient(config, github.fetch);

      expect(
        await client.createRepository(7, {
          owner: "acme",
          name: "app",
          private: true,
          accountType: "organization",
          userToken: null,
        }),
      ).toEqual({
        id: 9,
        fullName: "acme/app",
        cloneUrl: "https://github.com/acme/app.git",
        defaultBranch: "main",
        private: true,
      });
      expect(JSON.parse(String(github.calls[0]!.init?.body))).toEqual({
        permissions: { administration: "write", contents: "write", metadata: "read" },
      });
      expect(auth(github.calls[1]!)).toBe("Bearer ghs_admin");
      expect(JSON.parse(String(github.calls[1]!.init?.body))).toEqual({
        name: "app",
        private: true,
        auto_init: true,
      });
    });

    test("is created in a person's account with their own token", async () => {
      const github = fakeGithub({
        "POST /user/repos": {
          ...created,
          full_name: "ada/app",
          clone_url: "https://github.com/ada/app.git",
        },
      });
      const client = new GithubClient(config, github.fetch);

      const made = await client.createRepository(7, {
        owner: "ada",
        name: "app",
        private: false,
        accountType: "user",
        userToken: "ghu_ada",
      });

      expect(made.fullName).toBe("ada/app");
      expect(auth(github.calls[0]!)).toBe("Bearer ghu_ada");
      expect(JSON.parse(String(github.calls[0]!.init?.body))).toMatchObject({ private: false });
    });

    test("needs the person connected before it can be made in their account", async () => {
      const github = fakeGithub({});

      await expect(
        new GithubClient(config, github.fetch).createRepository(7, {
          owner: "ada",
          name: "app",
          private: true,
          accountType: "user",
          userToken: null,
        }),
      ).rejects.toBeInstanceOf(GithubUserRequiredError);
    });

    test("says to approve the app when its new permissions are not approved yet", async () => {
      const github = new GithubClient(config, async (_url, init) =>
        init?.method === "POST" ? new Response("no", { status: 422 }) : new Response("no"),
      );

      await expect(
        github.createRepository(7, {
          owner: "acme",
          name: "app",
          private: true,
          accountType: "organization",
          userToken: null,
        }),
      ).rejects.toBeInstanceOf(GithubCreateNotGrantedError);
    });

    test("says why GitHub refused the name", async () => {
      const github = new GithubClient(config, async (url, init) =>
        init?.method === "POST" && url.includes("/access_tokens")
          ? Response.json({ token: "ghs_admin" })
          : new Response("exists", { status: 422 }),
      );

      await expect(
        github.createRepository(7, {
          owner: "acme",
          name: "app",
          private: true,
          accountType: "organization",
          userToken: null,
        }),
      ).rejects.toBeInstanceOf(GithubRepositoryNotCreatedError);
    });

    test("is added to an installation that only reaches chosen repositories", async () => {
      const github = fakeGithub({
        "PUT /user/installations/7/repositories/9": {},
      });
      const client = new GithubClient(config, github.fetch);

      expect(await client.addRepositoryToInstallation(7, "ghu_ada", 9)).toBe(true);
      expect(auth(github.calls[0]!)).toBe("Bearer ghu_ada");
    });

    test("is not added when the person may not manage the installation", async () => {
      const github = fakeGithub({});

      expect(
        await new GithubClient(config, github.fetch).addRepositoryToInstallation(7, "ghu", 9),
      ).toBe(false);
    });

    test("is reachable once the installation token can read it", async () => {
      const github = fakeGithub({
        "POST /app/installations/7/access_tokens": { token: "ghs_read" },
        "GET /repos/acme/app": {},
      });
      const client = new GithubClient(config, github.fetch);

      expect(await client.canReach(7, "acme/app")).toBe(true);
      expect(await client.canReach(7, "acme/other")).toBe(false);
    });
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

  test("finds the pull requests of one branch by asking GitHub for exactly that branch", async () => {
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
      "GET /repos/acme/app/pulls?state=all&head=acme%3Afeat%2Fvector&per_page=100": [
        pull(9, "feat/vector", { state: "closed", merged_at: "2026-01-01T00:00:00Z" }),
        pull(8, "feat/vector-2"),
        pull(7, "feat/vector", { head: { ref: "feat/vector", repo: { full_name: "me/app" } } }),
      ],
    });
    const client = new GithubClient(config, github.fetch);

    expect(await client.branchPullRequests(7, "acme/app", "feat/vector")).toEqual([
      {
        number: 9,
        url: "https://github.com/acme/app/pull/9",
        title: "Pull 9",
        branch: "feat/vector",
        state: "merged",
      },
    ]);
    expect(auth(github.calls[1]!)).toBe("Bearer ghs_read");

    const refused = new GithubClient(config, async () => new Response("no", { status: 422 }));
    expect(await refused.branchPullRequests(7, "acme/app", "feat/vector")).toBeNull();
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
  test("lists the repositories an installation can reach, sorted by name", async () => {
    const repo = (full_name: string, isPrivate: boolean) => ({
      full_name,
      clone_url: `https://github.com/${full_name}.git`,
      default_branch: "main",
      private: isPrivate,
    });
    const github = fakeGithub({
      "POST /app/installations/7/access_tokens": {
        token: "ghs_read",
        expires_at: "2099-01-01T00:00:00Z",
      },
      "GET /installation/repositories?per_page=100&page=1": {
        total_count: 2,
        repositories: [repo("acme/zed", true), repo("acme/app", false)],
      },
    });

    expect(await new GithubClient(config, github.fetch).repositories(7)).toEqual([
      {
        fullName: "acme/app",
        cloneUrl: "https://github.com/acme/app.git",
        defaultBranch: "main",
        private: false,
      },
      {
        fullName: "acme/zed",
        cloneUrl: "https://github.com/acme/zed.git",
        defaultBranch: "main",
        private: true,
      },
    ]);
    expect(auth(github.calls[1]!)).toBe("Bearer ghs_read");
  });

  describe("unresolved review comments", () => {
    const answer = (status: number, body: unknown) => {
      const calls: Call[] = [];
      const fetch = async (url: string, init?: RequestInit) => {
        calls.push({ url, init });

        if (url.endsWith("/access_tokens")) {
          return Response.json({ token: "ghs_read", expires_at: "2099-01-01T00:00:00Z" });
        }

        return new Response(JSON.stringify(body), { status });
      };
      return { calls, client: new GithubClient(config, fetch) };
    };

    test("asks GraphQL for the threads of one pull request and keeps the unresolved ones", async () => {
      const { calls, client } = answer(200, {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  {
                    isResolved: false,
                    isOutdated: false,
                    path: "a.ts",
                    comments: { nodes: [{ body: "why?", author: { login: "bob" } }] },
                  },
                  {
                    isResolved: true,
                    isOutdated: false,
                    path: "b.ts",
                    comments: { nodes: [{ body: "ok", author: null }] },
                  },
                ],
              },
            },
          },
        },
      });

      expect(await client.unresolvedReviewComments(7, "acme/web", 12)).toEqual([
        { author: "bob", path: "a.ts", text: "why?", outdated: false },
      ]);
      const call = calls.at(-1)!;
      expect(call.url).toBe("https://api.github.com/graphql");
      expect(JSON.parse(String(call.init?.body)).variables).toEqual({
        owner: "acme",
        name: "web",
        number: 12,
      });
    });

    test("fails when GitHub answers an error, so the caller can say it could not read them", async () => {
      await expect(
        answer(502, {}).client.unresolvedReviewComments(7, "acme/web", 12),
      ).rejects.toThrow("502");
      await expect(
        answer(200, { errors: [{ message: "x" }] }).client.unresolvedReviewComments(
          7,
          "acme/web",
          12,
        ),
      ).rejects.toThrow();
    });

    test("wraps network errors from GraphQL and REST calls in UnavailableError", async () => {
      let count = 0;
      const client = new GithubClient(config, async (url) => {
        count++;

        if (url.endsWith("/access_tokens")) {
          return Response.json({ token: "ghs_read", expires_at: "2099-01-01T00:00:00Z" });
        }

        throw new TypeError("network down");
      });

      await expect(client.unresolvedReviewComments(7, "acme/web", 12)).rejects.toThrow(
        UnavailableError,
      );
      await expect(client.canReach(7, "acme/web")).rejects.toThrow("Could not reach GitHub");
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("configuration, OAuth edge cases, and token eviction", () => {
  test("exposes slug, webUrl, authorizeUrl, and resets state on configure()", async () => {
    const github = fakeGithub({
      "POST /app/installations/7/access_tokens": {
        token: "ghs_first",
        expires_at: "2099-01-01T00:00:00Z",
      },
    });
    const client = new GithubClient({ ...config, webUrl: "https://github.com/" }, github.fetch);

    expect(client.configured).toBe(true);
    expect(client.slug).toBe("aven-test");
    expect(client.webUrl).toBe("https://github.com");
    expect(client.authorizeUrl("state-123")).toBe(
      "https://github.com/login/oauth/authorize?client_id=Iv1.abc&state=state-123",
    );

    await client.installationToken(7);
    expect(github.calls).toHaveLength(1);

    client.configure({ ...config, slug: "aven-two", webUrl: "https://ghe.local/" });
    expect(client.slug).toBe("aven-two");
    expect(client.webUrl).toBe("https://ghe.local");
    await client.installationToken(7);
    expect(github.calls).toHaveLength(2);

    client.configure(null);
    expect(client.configured).toBe(false);
    expect(() => client.slug).toThrow(GithubNotConfiguredError);
    expect(() => client.webUrl).toThrow(GithubNotConfiguredError);
    expect(() => client.authorizeUrl("x")).toThrow(GithubNotConfiguredError);
  });

  test("preserves expires_in: 0 and refresh_token_expires_in: 0 instead of treating them as non-expiring", async () => {
    const before = Date.now();
    const github = fakeGithub({
      "POST /login/oauth/access_token": {
        access_token: "ghu_zero",
        expires_in: 0,
        refresh_token: "ghr_zero",
        refresh_token_expires_in: 0,
      },
    });
    const grant = await new GithubClient(config, github.fetch).exchangeCode("zero-code");
    const after = Date.now();

    expect(grant).not.toBeNull();
    expect(grant!.expiresAt).toBeGreaterThanOrEqual(before);
    expect(grant!.expiresAt).toBeLessThanOrEqual(after);
    expect(grant!.refreshExpiresAt).toBeGreaterThanOrEqual(before);
    expect(grant!.refreshExpiresAt).toBeLessThanOrEqual(after);
  });

  test("evicts a cached installation token on 401 and retries once with a fresh token", async () => {
    let issued = 0;
    const seenAuth: string[] = [];
    const client = new GithubClient(config, async (url, init) => {
      if (url.endsWith("/access_tokens")) {
        issued++;
        return Response.json({
          token: `ghs_tok_${issued}`,
          expires_at: "2099-01-01T00:00:00Z",
        });
      }

      const header = auth({ url, init });
      seenAuth.push(header);

      if (header === "Bearer ghs_tok_1" && seenAuth.length === 2) {
        return new Response("bad credentials", { status: 401 });
      }

      return Response.json({ full_name: "acme/web" });
    });

    expect(await client.canReach(7, "acme/web")).toBe(true);
    expect(await client.canReach(7, "acme/web")).toBe(true);
    expect(issued).toBe(2);
    expect(seenAuth).toEqual(["Bearer ghs_tok_1", "Bearer ghs_tok_1", "Bearer ghs_tok_2"]);
  });

  test("evicts the installation token and rethrows when a fresh token also gets 401", async () => {
    let issued = 0;
    const client = new GithubClient(config, async (url) => {
      if (url.endsWith("/access_tokens")) {
        issued++;
        return Response.json({
          token: `ghs_bad_${issued}`,
          expires_at: "2099-01-01T00:00:00Z",
        });
      }

      return new Response("unauthorized", { status: 401 });
    });

    await expect(client.canReach(7, "acme/web")).rejects.toBeInstanceOf(GithubApiError);
    await expect(client.canReach(7, "acme/web")).rejects.toBeInstanceOf(GithubApiError);
    expect(issued).toBe(2);
  });
});

describe("pull, commit, and branches details", () => {
  const tokenRoute = {
    "POST /app/installations/7/access_tokens": {
      token: "ghs_one",
      expires_at: "2099-01-01T00:00:00Z",
    },
  };

  describe("client.pull()", () => {
    const basePull = {
      number: 42,
      title: "Add feature",
      body: "PR body",
      html_url: "https://github.com/acme/web/pull/42",
      state: "open",
      draft: false,
      merged: false,
      user: { login: "ada" },
      base: { ref: "main" },
      head: { ref: "feat/add", sha: "sha_head" },
      additions: 12,
      deletions: 3,
      changed_files: 1,
      commits: 2,
      comments: 4,
      review_comments: 3,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-02T00:00:00Z",
      mergeable: true,
      requested_reviewers: [{ login: "grace" }],
    };

    test("assembles pull files, reviews, checks, and filesTruncated", async () => {
      const github = fakeGithub({
        ...tokenRoute,
        "GET /repos/acme/web/pulls/42": { ...basePull, changed_files: 150 },
        "GET /repos/acme/web/pulls/42/files?per_page=100": [
          {
            filename: "src/app.ts",
            status: "modified",
            additions: 12,
            deletions: 3,
            patch: "@@ -1 +1 @@",
          },
        ],
        "GET /repos/acme/web/pulls/42/reviews?per_page=100": [
          { user: { login: "bob" }, state: "CHANGES_REQUESTED" },
          { user: { login: "bob" }, state: "APPROVED" },
        ],
        "GET /repos/acme/web/commits/sha_head/check-runs?per_page=100": {
          check_runs: [
            {
              name: "ci",
              status: "completed",
              conclusion: "success",
              html_url: "https://github.com/acme/web/runs/1",
            },
          ],
        },
      });
      const detail = await new GithubClient(config, github.fetch).pull(7, "acme/web", 42);

      expect(detail).toEqual({
        number: 42,
        title: "Add feature",
        body: "PR body",
        url: "https://github.com/acme/web/pull/42",
        status: "open",
        author: "ada",
        base: "main",
        head: "feat/add",
        additions: 12,
        deletions: 3,
        changedFiles: 150,
        commits: 2,
        comments: 7,
        createdAt: "2026-11-01T00:00:00Z",
        updatedAt: "2026-11-02T00:00:00Z",
        mergeable: true,
        reviews: [{ login: "bob", state: "approved" }],
        requestedReviewers: ["grace"],
        checks: {
          state: "success",
          runs: [{ name: "ci", state: "success", url: "https://github.com/acme/web/runs/1" }],
        },
        files: [
          {
            path: "src/app.ts",
            oldPath: null,
            status: "modified",
            additions: 12,
            deletions: 3,
            patch: "@@ -1 +1 @@",
          },
        ],
        filesTruncated: true,
      });
    });

    test("returns null on 404, degrades on 403 for reviews/checks, and propagates 500", async () => {
      const missing = fakeGithub({ ...tokenRoute });
      expect(await new GithubClient(config, missing.fetch).pull(7, "acme/web", 99)).toBeNull();

      const forbiddenAux = new GithubClient(config, async (url) => {
        if (url.endsWith("/access_tokens")) {
          return Response.json({ token: "ghs_one", expires_at: "2099-01-01T00:00:00Z" });
        }

        if (url.endsWith("/pulls/42")) return Response.json(basePull);

        if (url.includes("/pulls/42/files")) return Response.json([]);

        return new Response("forbidden", { status: 403 });
      });
      const degraded = await forbiddenAux.pull(7, "acme/web", 42);
      expect(degraded?.reviews).toEqual([]);
      expect(degraded?.checks).toEqual({ state: "none", runs: [] });

      const failingAux = new GithubClient(config, async (url) => {
        if (url.endsWith("/access_tokens")) {
          return Response.json({ token: "ghs_one", expires_at: "2099-01-01T00:00:00Z" });
        }

        if (url.endsWith("/pulls/42")) return Response.json(basePull);

        if (url.includes("/pulls/42/files")) return Response.json([]);

        return new Response("boom", { status: 500 });
      });
      await expect(failingAux.pull(7, "acme/web", 42)).rejects.toThrow("GitHub answered 500");
    });
  });

  describe("client.commit()", () => {
    test("returns commit stats, files, filesTruncated, and null on 404", async () => {
      const manyFiles = Array.from({ length: 105 }, (_, index) => ({
        filename: `file-${index}.ts`,
        status: "added",
        additions: 1,
        deletions: 0,
      }));
      const github = fakeGithub({
        ...tokenRoute,
        "GET /repos/acme/web/commits/abc123": {
          sha: "abc123",
          html_url: "https://github.com/acme/web/commit/abc123",
          commit: {
            message: "Big commit\n\nDetails",
            author: { name: "Ada", date: "2026-11-01T10:00:00Z" },
          },
          author: { login: "ada" },
          parents: [{ sha: "p0" }],
          stats: { additions: 105, deletions: 4 },
          files: manyFiles,
        },
      });
      const client = new GithubClient(config, github.fetch);

      const detail = await client.commit(7, "acme/web", "abc123");
      expect(detail).toMatchObject({
        sha: "abc123",
        message: "Big commit\n\nDetails",
        author: "Ada",
        date: "2026-11-01T10:00:00Z",
        url: "https://github.com/acme/web/commit/abc123",
        parents: ["p0"],
        additions: 105,
        deletions: 4,
        filesTruncated: true,
      });
      expect(detail?.files).toHaveLength(100);
      expect(await client.commit(7, "acme/web", "missing")).toBeNull();
    });
  });

  describe("client.branches()", () => {
    test("summarizes branches with default first, sorted dates, ahead/behind, and open PRs", async () => {
      const github = fakeGithub({
        ...tokenRoute,
        "GET /repos/acme/web/branches?per_page=100": [
          { name: "feat/old", protected: false },
          { name: "main", protected: true },
          { name: "feat/new", protected: false },
        ],
        "GET /repos/acme/web/pulls?state=open&per_page=100": [
          {
            number: 11,
            title: "New feature",
            head: { ref: "feat/new", repo: { full_name: "acme/web" } },
          },
          {
            number: 12,
            title: "Fork PR",
            head: { ref: "feat/old", repo: { full_name: "other/web" } },
          },
        ],
        "GET /repos/acme/web/commits/main": {
          sha: "s-main",
          commit: {
            message: "Main head\nbody",
            author: { name: "Ada", date: "2026-11-01T10:00:00Z" },
          },
          author: { login: "ada" },
          parents: [],
        },
        "GET /repos/acme/web/commits/feat%2Fold": {
          sha: "s-old",
          commit: {
            message: "Old work",
            author: { name: "Bo", date: "2026-11-02T10:00:00Z" },
          },
          author: null,
          parents: [],
        },
        "GET /repos/acme/web/commits/feat%2Fnew": {
          sha: "s-new",
          commit: {
            message: "New work",
            author: { name: "Cy", date: "2026-11-05T10:00:00Z" },
          },
          author: null,
          parents: [],
        },
        "GET /repos/acme/web/compare/main...feat%2Fold?per_page=1": { ahead_by: 1, behind_by: 4 },
        "GET /repos/acme/web/compare/main...feat%2Fnew?per_page=1": { ahead_by: 3, behind_by: 0 },
      });
      const result = await new GithubClient(config, github.fetch).branches(7, "acme/web", "main");

      expect(result).toEqual({
        truncated: false,
        branches: [
          {
            name: "main",
            isDefault: true,
            protected: true,
            ahead: 0,
            behind: 0,
            lastCommit: {
              sha: "s-main",
              message: "Main head",
              author: "Ada",
              date: "2026-11-01T10:00:00Z",
            },
            pull: null,
          },
          {
            name: "feat/new",
            isDefault: false,
            protected: false,
            ahead: 3,
            behind: 0,
            lastCommit: {
              sha: "s-new",
              message: "New work",
              author: "Cy",
              date: "2026-11-05T10:00:00Z",
            },
            pull: { number: 11, title: "New feature" },
          },
          {
            name: "feat/old",
            isDefault: false,
            protected: false,
            ahead: 1,
            behind: 4,
            lastCommit: {
              sha: "s-old",
              message: "Old work",
              author: "Bo",
              date: "2026-11-02T10:00:00Z",
            },
            pull: null,
          },
        ],
      });
    });

    test("returns null when repository is missing and propagates 500 on auxiliary branch calls", async () => {
      const missing = fakeGithub({ ...tokenRoute });
      expect(
        await new GithubClient(config, missing.fetch).branches(7, "acme/gone", "main"),
      ).toBeNull();

      const failingPulls = new GithubClient(config, async (url) => {
        if (url.endsWith("/access_tokens")) {
          return Response.json({ token: "ghs_one", expires_at: "2099-01-01T00:00:00Z" });
        }

        if (url.includes("/branches?")) {
          return Response.json([{ name: "main", protected: true }]);
        }

        return new Response("boom", { status: 500 });
      });
      await expect(failingPulls.branches(7, "acme/web", "main")).rejects.toThrow(
        "GitHub answered 500",
      );
    });
  });

  test("commits() does not fetch branches or tags when commits request fails or is empty", async () => {
    const calls: string[] = [];
    const client = new GithubClient(config, async (url) => {
      calls.push(url);

      if (url.endsWith("/access_tokens")) {
        return Response.json({ token: "ghs_one", expires_at: "2099-01-01T00:00:00Z" });
      }

      if (url.includes("/acme/missing/commits")) return new Response("gone", { status: 404 });

      if (url.includes("/acme/empty/commits")) return Response.json([]);

      return new Response("unexpected", { status: 500 });
    });

    expect(await client.commits(7, "acme/missing", 1, "main")).toBeNull();
    expect(await client.commits(7, "acme/empty", 1, "main")).toEqual({
      commits: [],
      hasMore: false,
    });
    expect(calls.some((url) => url.includes("/branches") || url.includes("/tags"))).toBe(false);
  });
});
