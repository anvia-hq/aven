import { createSign } from "node:crypto";

import { ConflictError, UnavailableError } from "../../errors";

export type GithubConfig = {
  appId: string;
  /** PEM. Literal `\n` sequences (as in a one-line .env value) are accepted. */
  privateKey: string;
  /** The app's URL name, github.com/apps/<slug>. */
  slug: string;
  /** For checking that the user installing the app may use the installation. */
  clientId: string;
  clientSecret: string;
  /** GitHub's REST API; only differs for GitHub Enterprise or a test double. */
  apiUrl: string;
  /** Where GitHub's web side (the OAuth token exchange) lives. */
  webUrl: string;
};

export type GithubRepo = {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  cloneUrl: string;
  description: string | null;
};

export class GithubNotConfiguredError extends UnavailableError {
  constructor() {
    super("GitHub is not configured on this control plane");
  }
}

/** The app has not been approved to write for the installation's account, which Ship needs (decision 0044). */
export class GithubWriteNotGrantedError extends ConflictError {
  constructor(accountLogin: string) {
    super(
      `The Aven app has not been approved to write to ${accountLogin} on GitHub. Approve its new permissions there, then try again.`,
    );
  }
}

/** The person cannot push to the repository, so they cannot ship to it (decision 0041). */
export class GithubNoPushAccessError extends ConflictError {
  constructor(fullName: string) {
    super(`You do not have write access to ${fullName} on GitHub`);
  }
}

class GithubApiError extends UnavailableError {
  constructor(
    message: string,
    /** The status GitHub answered with. */
    readonly status: number,
  ) {
    super(message);
  }
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
  return {
    appId: GITHUB_APP_ID,
    privateKey: GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"),
    slug: GITHUB_APP_SLUG,
    clientId: GITHUB_APP_CLIENT_ID,
    clientSecret: GITHUB_APP_CLIENT_SECRET,
    apiUrl: env.GITHUB_API_URL ?? "https://api.github.com",
    webUrl: env.GITHUB_WEB_URL ?? "https://github.com",
  } satisfies GithubConfig;
}

// A listing is read this many entries at a time, and no further than so many pages.
const PAGE_SIZE = 100;
const MAX_PAGES = 5;
// A token is renewed this long before GitHub would expire it.
const TOKEN_MARGIN_MS = 5 * 60_000;

export type GithubPullRequest = { number: number; url: string };

type PullPayload = { number: number; html_url: string };

/**
 * A person's GitHub user access token and when it expires, with the token that renews it and when
 * that expires (milliseconds since the epoch). An app whose user tokens do not expire has neither.
 */
export type GithubUserGrant = {
  accessToken: string;
  expiresAt: number | null;
  refreshToken: string | null;
  refreshExpiresAt: number | null;
};

export type GithubUserProfile = { id: number; login: string; name: string | null };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

type RepoPayload = {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
  clone_url: string;
  description: string | null;
};

const toRepo = (repo: RepoPayload): GithubRepo => ({
  id: repo.id,
  fullName: repo.full_name,
  private: repo.private,
  defaultBranch: repo.default_branch,
  cloneUrl: repo.clone_url,
  description: repo.description,
});

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

// Talks to GitHub as the app (a signed JWT) or as one installation (a short-lived token). The
// tokens for listing and cloning are read-only (decision 0013); writing is done as the person, with
// their own user access token (decision 0041). `fetch` is injectable so tests never hit GitHub.
export class GithubClient {
  #tokens = new Map<number, { token: string; expiresAt: number }>();

  constructor(
    private config: GithubConfig | null,
    private fetchImpl: Fetch = fetch,
  ) {}

  get configured() {
    return this.config !== null;
  }

  get slug() {
    return this.#config().slug;
  }

  #config() {
    if (!this.config) throw new GithubNotConfiguredError();
    return this.config;
  }

  #appJwt() {
    const { appId, privateKey } = this.#config();
    const now = Math.floor(Date.now() / 1000);
    const head = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    // Issued a minute in the past to tolerate clock drift; GitHub allows ten minutes at most.
    const body = base64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
    const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey);
    return `${head}.${body}.${base64url(signature)}`;
  }

  async #api<T>(path: string, auth: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${auth}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "aven",
    };
    if (init.body) headers["content-type"] = "application/json";
    const response = await this.fetchImpl(`${this.#config().apiUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      throw new GithubApiError(
        `GitHub answered ${response.status} for ${init.method ?? "GET"} ${path}`,
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  // The entries of a paged listing, page by page until a short one or MAX_PAGES. A caller that
  // stops early asks for no further page.
  async *#pages<P, T>(path: string, auth: string, entriesOf: (page: P) => T[]) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const entries = entriesOf(
        await this.#api<P>(`${path}?per_page=${PAGE_SIZE}&page=${page}`, auth),
      );
      yield* entries;
      if (entries.length < PAGE_SIZE) return;
    }
  }

  /** The account an installation belongs to; fails when the app is not installed with that id. */
  async installation(installationId: number) {
    const found = await this.#api<{ id: number; account: { login: string } | null }>(
      `/app/installations/${installationId}`,
      this.#appJwt(),
    );
    return { installationId: found.id, accountLogin: found.account?.login ?? "unknown" };
  }

  /** A read-only token for the installation's repositories, valid for about an hour. */
  async installationToken(installationId: number) {
    const cached = this.#tokens.get(installationId);
    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > Date.now()) return cached;
    const issued = await this.#api<{ token: string; expires_at: string }>(
      `/app/installations/${installationId}/access_tokens`,
      this.#appJwt(),
      {
        method: "POST",
        body: JSON.stringify({ permissions: { contents: "read", metadata: "read" } }),
      },
    );
    const entry = { token: issued.token, expiresAt: Date.parse(issued.expires_at) };
    this.#tokens.set(installationId, entry);
    return entry;
  }

  /** The page where a person lets the app act as their GitHub account; GitHub comes back to the app's Callback URL. */
  authorizeUrl(state: string) {
    const { clientId, webUrl } = this.#config();
    return `${webUrl}/login/oauth/authorize?${new URLSearchParams({ client_id: clientId, state })}`;
  }

  /**
   * The latest pull request, open or not, whose head is `head` in `fullName`, or null: what the
   * agent opened with `gh` for a thread's branch (decision 0044). Read with a token for that
   * repository that may only read pull requests, minted for the call; an installation that cannot
   * give one (the permission is not approved) just has none.
   */
  async findPullRequest(installationId: number, fullName: string, head: string) {
    const [owner, name] = fullName.split("/") as [string, string];
    let token: string;
    try {
      const issued = await this.#api<{ token: string }>(
        `/app/installations/${installationId}/access_tokens`,
        this.#appJwt(),
        {
          method: "POST",
          body: JSON.stringify({
            repositories: [name],
            permissions: { pull_requests: "read", metadata: "read" },
          }),
        },
      );
      token = issued.token;
    } catch (error) {
      if (error instanceof GithubApiError && error.status === 422) return null;
      throw error;
    }
    const query = new URLSearchParams({
      state: "all",
      sort: "created",
      direction: "desc",
      per_page: "1",
      head: `${owner}:${head}`,
    });
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls`;
    const [found] = await this.#api<PullPayload[]>(`${path}?${query}`, token);
    return found
      ? ({ number: found.number, url: found.html_url } satisfies GithubPullRequest)
      : null;
  }

  /** Whether the installation has been approved to write contents and pull requests. */
  async canWrite(installationId: number) {
    const found = await this.#api<{ permissions?: Record<string, string> }>(
      `/app/installations/${installationId}`,
      this.#appJwt(),
    );
    return found.permissions?.contents === "write" && found.permissions?.pull_requests === "write";
  }

  /** Whether the person's token may push to the repository; false when it cannot even see it. */
  async canPush(userToken: string, fullName: string) {
    const [owner, name] = fullName.split("/").map(encodeURIComponent);
    const found = await this.#api<{ permissions?: { push?: boolean } }>(
      `/repos/${owner}/${name}`,
      userToken,
    ).catch((error: unknown) => {
      if (error instanceof GithubApiError && error.status === 404) return null;
      throw error;
    });
    return found?.permissions?.push === true;
  }

  async listRepos(installationId: number) {
    const { token } = await this.installationToken(installationId);
    const repos: GithubRepo[] = [];
    const pages = this.#pages(
      "/installation/repositories",
      token,
      (page: { repositories: RepoPayload[] }) => page.repositories,
    );
    for await (const repo of pages) repos.push(toRepo(repo));
    return repos;
  }

  /** One repository, if the installation can see it. */
  async repo(installationId: number, fullName: string) {
    const { token } = await this.installationToken(installationId);
    const [owner, name] = fullName.split("/").map(encodeURIComponent);
    const payload = await this.#api<RepoPayload>(`/repos/${owner}/${name}`, token).catch(
      (error: unknown) => {
        if (error instanceof GithubApiError && error.status === 404) return null;
        throw error;
      },
    );
    return payload ? toRepo(payload) : null;
  }

  // Whether GitHub lists `installationId` among the installations the person's token can use: they
  // authorised the app during installation, so it is theirs to connect.
  async userCanUse(userToken: string, installationId: number) {
    const installations = this.#pages(
      "/user/installations",
      userToken,
      (page: { installations: { id: number }[] }) => page.installations,
    );
    for await (const entry of installations) if (entry.id === installationId) return true;
    return false;
  }

  /** The person's token for an OAuth `code`, or null when GitHub does not grant one. */
  exchangeCode(code: string) {
    return this.#grant({ code });
  }

  /** A new token for a refresh token; null when GitHub refuses it (expired, used or revoked). */
  refreshGrant(refreshToken: string) {
    return this.#grant({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  async userProfile(userToken: string): Promise<GithubUserProfile> {
    const user = await this.#api<{ id: number; login: string; name: string | null }>(
      "/user",
      userToken,
    );
    return { id: user.id, login: user.login, name: user.name };
  }

  // GitHub answers a refused code or refresh token with a 200 (or a 4xx) and an `error`, so a grant
  // is what has an access token in it.
  async #grant(params: Record<string, string>): Promise<GithubUserGrant | null> {
    const { clientId, clientSecret, webUrl } = this.#config();
    const exchange = await this.fetchImpl(`${webUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...params }),
    }).catch(() => {
      throw new UnavailableError("Could not reach GitHub");
    });
    // A GitHub that is down has not refused anything: the caller must not take it for a refusal.
    if (exchange.status >= 500) {
      throw new GithubApiError(
        `GitHub answered ${exchange.status} for POST /login/oauth/access_token`,
        exchange.status,
      );
    }
    const granted = (await exchange.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      refresh_token_expires_in?: number;
    };
    if (!exchange.ok || !granted.access_token) return null;
    const now = Date.now();
    const after = (seconds: number | undefined) => (seconds ? now + seconds * 1000 : null);
    return {
      accessToken: granted.access_token,
      expiresAt: after(granted.expires_in),
      refreshToken: granted.refresh_token ?? null,
      refreshExpiresAt: after(granted.refresh_token_expires_in),
    };
  }
}

export const github = new GithubClient(githubConfigFromEnv());
