import { createSign } from "node:crypto";

import { UnavailableError } from "@aven/server-kit/errors";
import { GithubApiError, GithubNotConfiguredError } from "./errors";
import type { GithubConfig, GithubFetch } from "./types";

export const PAGE_SIZE = 100;
export const MAX_PAGES = 5;

const stripTrailingSlashes = (url: string) => url.replace(/\/+$/, "");

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

function normalizeConfig(config: GithubConfig): GithubConfig {
  return {
    ...config,
    apiUrl: stripTrailingSlashes(config.apiUrl),
    webUrl: stripTrailingSlashes(config.webUrl),
  };
}

export function githubConfigFromEnv(env: Record<string, string | undefined> = process.env) {
  const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_SLUG } = env;
  const { GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET } = env;

  if (
    !GITHUB_APP_ID ||
    !GITHUB_APP_PRIVATE_KEY ||
    !GITHUB_APP_SLUG ||
    !GITHUB_APP_CLIENT_ID ||
    !GITHUB_APP_CLIENT_SECRET
  ) {
    return null;
  }

  return normalizeConfig({
    appId: GITHUB_APP_ID,
    privateKey: GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"),
    slug: GITHUB_APP_SLUG,
    clientId: GITHUB_APP_CLIENT_ID,
    clientSecret: GITHUB_APP_CLIENT_SECRET,
    apiUrl: env.GITHUB_API_URL ?? "https://api.github.com",
    webUrl: env.GITHUB_WEB_URL ?? "https://github.com",
  });
}

export function splitFullName(fullName: string): [string, string] {
  const parts = fullName.split("/");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid GitHub repository name: ${fullName}`);
  }

  return [parts[0], parts[1]];
}

export function repoPath(fullName: string) {
  const [owner, name] = splitFullName(fullName);
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

export function contentsPath(path: string) {
  return path === "" ? "" : `/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function parseNextLink(header: string | null): string | null {
  if (!header) return null;

  const match = header.match(/<([^>]+)>;\s*rel="next"/);
  return match?.[1] ?? null;
}

export function hasNextLink(header: string | null) {
  return parseNextLink(header) !== null;
}

function isSameOrigin(targetUrl: string, baseUrl: string) {
  try {
    return new URL(targetUrl).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

export class GithubTransport {
  #config: GithubConfig | null;
  #fetch: GithubFetch;

  constructor(config: GithubConfig | null, fetchImpl: GithubFetch = fetch) {
    this.#config = config ? normalizeConfig(config) : null;
    this.#fetch = fetchImpl;
  }

  get configured() {
    return this.#config !== null;
  }

  configure(config: GithubConfig | null) {
    this.#config = config ? normalizeConfig(config) : null;
  }

  get slug() {
    return this.requireConfig().slug;
  }

  get webUrl() {
    return this.requireConfig().webUrl;
  }

  requireConfig(): GithubConfig {
    if (!this.#config) throw new GithubNotConfiguredError();

    return this.#config;
  }

  appJwt() {
    const { appId, privateKey } = this.requireConfig();
    const now = Math.floor(Date.now() / 1000);
    const head = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const body = base64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
    const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey);
    return `${head}.${body}.${base64url(signature)}`;
  }

  async #send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.#fetch(url, init);
    } catch {
      throw new UnavailableError("Could not reach GitHub");
    }
  }

  async request(pathOrUrl: string, auth: string, init: RequestInit = {}): Promise<Response> {
    const apiUrl = this.requireConfig().apiUrl;
    const isAbsolute = pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://");
    const url = isAbsolute ? pathOrUrl : `${apiUrl}${pathOrUrl}`;
    const label = isAbsolute ? new URL(pathOrUrl).pathname : pathOrUrl;
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${auth}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "aven",
    };

    if (init.body) headers["content-type"] = "application/json";

    const response = await this.#send(url, { ...init, headers });

    if (!response.ok) {
      throw new GithubApiError(
        `GitHub answered ${response.status} for ${init.method ?? "GET"} ${label}`,
        response.status,
      );
    }

    return response;
  }

  async get<T>(path: string, auth: string): Promise<T> {
    return (await this.request(path, auth)).json() as Promise<T>;
  }

  async post<T>(path: string, auth: string, body: unknown): Promise<T> {
    return (
      await this.request(path, auth, { method: "POST", body: JSON.stringify(body) })
    ).json() as Promise<T>;
  }

  async patch<T>(path: string, auth: string, body: unknown): Promise<T> {
    return (
      await this.request(path, auth, { method: "PATCH", body: JSON.stringify(body) })
    ).json() as Promise<T>;
  }

  async putJson<T>(path: string, auth: string, body: unknown): Promise<T> {
    return (
      await this.request(path, auth, { method: "PUT", body: JSON.stringify(body) })
    ).json() as Promise<T>;
  }

  async getText(path: string, auth: string): Promise<string> {
    return (await this.request(path, auth)).text();
  }

  put(path: string, auth: string) {
    return this.request(path, auth, { method: "PUT" });
  }

  async graphql<T>(auth: string, query: string, variables: Record<string, unknown>): Promise<T> {
    const base = this.requireConfig().apiUrl;
    const url = base.endsWith("/api/v3")
      ? `${base.slice(0, -"/v3".length)}/graphql`
      : `${base}/graphql`;
    const response = await this.#send(url, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${auth}`,
        "content-type": "application/json",
        "user-agent": "aven",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new GithubApiError(
        `GitHub answered ${response.status} for POST /graphql`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  oauthPost(path: string, body: Record<string, string>) {
    const { webUrl } = this.requireConfig();
    return this.#send(`${webUrl}${path}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async *pages<P, T>(
    path: string,
    auth: string,
    entriesOf: (page: P) => T[],
    maxPages = MAX_PAGES,
  ) {
    const separator = path.includes("?") ? "&" : "?";
    let next: string | null = `${path}${separator}per_page=${PAGE_SIZE}&page=1`;

    for (let page = 1; page <= maxPages && next !== null; page++) {
      const response = await this.request(next, auth);
      const entries = entriesOf((await response.json()) as P);
      yield* entries;

      const linkHeader = response.headers.get("link");
      const linkNext = parseNextLink(linkHeader);

      if (linkNext !== null) {
        if (!isSameOrigin(linkNext, this.requireConfig().apiUrl)) return;

        next = linkNext;
      } else if (linkHeader !== null || entries.length < PAGE_SIZE) {
        return;
      } else {
        next = `${path}${separator}per_page=${PAGE_SIZE}&page=${page + 1}`;
      }
    }
  }
}
