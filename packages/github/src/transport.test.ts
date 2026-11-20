import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";

import { UnavailableError } from "@aven/server-kit/errors";
import {
  githubConfigFromEnv,
  GithubTransport,
  parseNextLink,
  repoPath,
  splitFullName,
} from "./transport";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const baseConfig = {
  appId: "123",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  slug: "aven-test",
  clientId: "Iv1.abc",
  clientSecret: "secret",
  apiUrl: "https://api.github.com",
  webUrl: "https://github.com",
};

describe("transport helpers", () => {
  test("githubConfigFromEnv strips trailing slashes on apiUrl and webUrl", () => {
    const cfg = githubConfigFromEnv({
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY: "key",
      GITHUB_APP_SLUG: "slug",
      GITHUB_APP_CLIENT_ID: "cid",
      GITHUB_APP_CLIENT_SECRET: "csec",
      GITHUB_API_URL: "https://ghe.example.com/api/v3///",
      GITHUB_WEB_URL: "https://ghe.example.com/",
    });
    expect(cfg?.apiUrl).toBe("https://ghe.example.com/api/v3");
    expect(cfg?.webUrl).toBe("https://ghe.example.com");
  });

  test("splitFullName validates owner/name and rejects malformed names", () => {
    expect(splitFullName("acme/web")).toEqual(["acme", "web"]);
    expect(repoPath("acme/my repo")).toBe("/repos/acme/my%20repo");
    expect(() => splitFullName("invalid")).toThrow("Invalid GitHub repository name");
    expect(() => splitFullName("a/b/c")).toThrow("Invalid GitHub repository name");
    expect(() => splitFullName("/repo")).toThrow("Invalid GitHub repository name");
    expect(() => splitFullName("owner/")).toThrow("Invalid GitHub repository name");
  });

  test("parseNextLink extracts only rel=next URLs", () => {
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink('<https://api.github.com/x?page=1>; rel="prev"')).toBeNull();
    expect(
      parseNextLink(
        '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=5>; rel="last"',
      ),
    ).toBe("https://api.github.com/x?page=2");
  });
});

describe("GithubTransport", () => {
  test("wraps network errors in UnavailableError for REST and GraphQL requests", async () => {
    const transport = new GithubTransport(baseConfig, async () => {
      throw new TypeError("socket hang up");
    });

    await expect(transport.get("/user", "tok")).rejects.toThrow(UnavailableError);
    await expect(transport.get("/user", "tok")).rejects.toThrow("Could not reach GitHub");
    await expect(transport.graphql("tok", "query { viewer { login } }", {})).rejects.toThrow(
      UnavailableError,
    );
    await expect(transport.graphql("tok", "query { viewer { login } }", {})).rejects.toThrow(
      "Could not reach GitHub",
    );
  });

  test("resolves GraphQL URL for GitHub Enterprise /api/v3 with trailing slash normalized", async () => {
    const urls: string[] = [];
    const transport = new GithubTransport(
      {
        ...baseConfig,
        apiUrl: "https://ghe.example.com/api/v3/",
        webUrl: "https://ghe.example.com/",
      },
      async (url) => {
        urls.push(url);
        return Response.json({ data: { ok: true } });
      },
    );

    expect(transport.webUrl).toBe("https://ghe.example.com");
    expect(await transport.graphql("tok", "query {}", {})).toEqual({ data: { ok: true } });
    expect(urls).toEqual(["https://ghe.example.com/api/graphql"]);
  });

  test("follows Link rel=next pagination across pages and stops when rel=next disappears", async () => {
    const calls: string[] = [];
    const transport = new GithubTransport(baseConfig, async (url) => {
      calls.push(url);

      if (url.endsWith("page=1")) {
        return new Response(JSON.stringify({ items: [1, 2] }), {
          headers: {
            link: '<https://api.github.com/items?cursor=abc>; rel="next", <https://api.github.com/items?cursor=end>; rel="last"',
          },
        });
      }

      if (url === "https://api.github.com/items?cursor=abc") {
        return new Response(JSON.stringify({ items: [3] }), {
          headers: { link: '<https://api.github.com/items?per_page=100&page=1>; rel="prev"' },
        });
      }

      return new Response("unexpected", { status: 500 });
    });

    const collected: number[] = [];
    for await (const item of transport.pages<{ items: number[] }, number>(
      "/items",
      "tok",
      (page) => page.items,
    )) {
      collected.push(item);
    }

    expect(collected).toEqual([1, 2, 3]);
    expect(calls).toEqual([
      "https://api.github.com/items?per_page=100&page=1",
      "https://api.github.com/items?cursor=abc",
    ]);
  });

  test("caps Link pagination at maxPages and refuses cross-origin next links", async () => {
    let seen = 0;
    const capped = new GithubTransport(baseConfig, async () => {
      seen++;
      return new Response(JSON.stringify({ items: [seen] }), {
        headers: { link: `<https://api.github.com/items?page=${seen + 1}>; rel="next"` },
      });
    });

    const items: number[] = [];
    for await (const item of capped.pages<{ items: number[] }, number>(
      "/items",
      "tok",
      (page) => page.items,
      3,
    )) {
      items.push(item);
    }
    expect(items).toEqual([1, 2, 3]);

    const foreignCalls: string[] = [];
    const foreign = new GithubTransport(baseConfig, async (url) => {
      foreignCalls.push(url);
      return new Response(JSON.stringify({ items: [1] }), {
        headers: { link: '<https://evil.example.com/steal>; rel="next"' },
      });
    });

    const safeItems: number[] = [];
    for await (const item of foreign.pages<{ items: number[] }, number>(
      "/items",
      "tok",
      (page) => page.items,
    )) {
      safeItems.push(item);
    }
    expect(safeItems).toEqual([1]);
    expect(foreignCalls).toHaveLength(1);
  });
});
