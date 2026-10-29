import { createSign } from "node:crypto";

import { UnavailableError } from "../../errors";

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

export class GithubApiError extends UnavailableError {}

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

const REPO_PAGE_SIZE = 100;
const MAX_REPO_PAGES = 5;
// A token is renewed this long before GitHub would expire it.
const TOKEN_MARGIN_MS = 5 * 60_000;

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

// Talks to GitHub as the app (a signed JWT) or as one installation (a short-lived token). Only
// read access is ever requested (decision 0013). `fetch` is injectable so tests never hit GitHub.
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
      );
    }
    return (await response.json()) as T;
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

  async listRepos(installationId: number) {
    const { token } = await this.installationToken(installationId);
    const repos: GithubRepo[] = [];
    for (let page = 1; page <= MAX_REPO_PAGES; page++) {
      const result = await this.#api<{ repositories: RepoPayload[] }>(
        `/installation/repositories?per_page=${REPO_PAGE_SIZE}&page=${page}`,
        token,
      );
      repos.push(...result.repositories.map(toRepo));
      if (result.repositories.length < REPO_PAGE_SIZE) break;
    }
    return repos;
  }

  /** One repository, if the installation can see it. */
  async repo(installationId: number, fullName: string) {
    const { token } = await this.installationToken(installationId);
    const [owner, name] = fullName.split("/").map(encodeURIComponent);
    const payload = await this.#api<RepoPayload>(`/repos/${owner}/${name}`, token).catch(
      (error: unknown) => {
        if (error instanceof GithubApiError && /answered 404/.test(error.message)) return null;
        throw error;
      },
    );
    return payload ? toRepo(payload) : null;
  }

  // Whether the person who came back from GitHub's install page may use `installationId`: they
  // authorised the app during installation (`code`), and GitHub lists the installation among theirs.
  async userCanUse(code: string, installationId: number) {
    const { clientId, clientSecret, webUrl } = this.#config();
    const exchange = await this.fetchImpl(`${webUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const granted = (await exchange.json().catch(() => ({}))) as { access_token?: string };
    if (!exchange.ok || !granted.access_token) return false;
    for (let page = 1; page <= MAX_REPO_PAGES; page++) {
      const result = await this.#api<{ installations: { id: number }[] }>(
        `/user/installations?per_page=${REPO_PAGE_SIZE}&page=${page}`,
        granted.access_token,
      );
      if (result.installations.some((entry) => entry.id === installationId)) return true;
      if (result.installations.length < REPO_PAGE_SIZE) return false;
    }
    return false;
  }
}

export const github = new GithubClient(githubConfigFromEnv());
