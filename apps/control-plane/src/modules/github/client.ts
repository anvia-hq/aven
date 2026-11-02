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

/** The app has not been approved to read issues for the installation's account (decision 0092). */
export class GithubIssuesNotGrantedError extends ConflictError {
  constructor(accountLogin: string) {
    super(
      `The Aven app has not been approved to read issues on ${accountLogin} on GitHub. Approve its new permissions there to list them here.`,
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

export type GithubPullRequest = {
  number: number;
  url: string;
  title: string;
  /** The head branch. */
  branch: string;
  state: "open" | "closed" | "merged";
};

type PullPayload = {
  number: number;
  html_url: string;
  title: string;
  state: string;
  merged_at: string | null;
  head: { ref: string; repo: { full_name: string } | null };
};

function pullState(pull: PullPayload): GithubPullRequest["state"] {
  if (pull.merged_at) return "merged";
  return pull.state === "open" ? "open" : "closed";
}

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

/** One entry of a folder of a repository, as the project page lists it (decision 0082). */
export type GithubTreeEntry = { name: string; path: string; type: "file" | "directory" };

/** A repository's README as text, cut to `README_MAX_CHARS`. */
export type GithubReadme = { name: string; path: string; text: string; truncated: boolean };

export const README_MAX_CHARS = 200_000;

/** One commit of the repository's default branch, as the project page lists it. */
export type GithubCommit = {
  sha: string;
  /** The first line of the message. */
  message: string;
  /** Who wrote it: the name on the commit, else their GitHub login. */
  author: string | null;
  date: string;
  /** The commits it follows, the first being the branch it was made on; what the graph is drawn from (decision 0090). */
  parents: string[];
  /** The branches whose latest commit it is. */
  refs: string[];
};

/** One page of commits, and whether GitHub has an older one. */
export type GithubCommitPage = { commits: GithubCommit[]; hasMore: boolean };

export const COMMITS_PER_PAGE = 10;
const COMMIT_MESSAGE_MAX = 200;

/** Pull requests and issues of a repository, as the project page lists them (decision 0092). */
export type GithubTrackedKind = "pull" | "issue";
export type GithubTrackedState = "open" | "closed";

export type GithubTrackedItem = {
  number: number;
  title: string;
  url: string;
  /** The author's GitHub login, none for a user GitHub no longer has. */
  author: string | null;
  /** A pull request is `draft` while open as one and `merged` when closed by merging; an issue is open or closed. */
  status: "open" | "draft" | "merged" | "closed";
  comments: number;
  updatedAt: string;
};

/** One page of them, how many there are in all, and whether GitHub has a later page. */
export type GithubTrackedPage = { items: GithubTrackedItem[]; total: number; hasMore: boolean };

export const TRACKED_PER_PAGE = 10;
// GitHub's search answers the first thousand matches only.
const SEARCH_MAX_RESULTS = 1000;

type TrackedPayload = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft?: boolean;
  comments: number;
  updated_at: string;
  user: { login: string } | null;
  pull_request?: { merged_at: string | null };
};

function trackedStatus(item: TrackedPayload): GithubTrackedItem["status"] {
  if (item.pull_request?.merged_at) return "merged";
  if (item.state !== "open") return "closed";
  return item.draft ? "draft" : "open";
}

type CommitPayload = {
  sha: string;
  commit: { message: string; author: { name: string; date: string } | null };
  author: { login: string } | null;
  parents: { sha: string }[];
};

type Branch = { name: string; commit: { sha: string } };

// How many branches are asked for, to say which commits are where one ends: GitHub's page maximum.
const BRANCHES_LISTED = 100;

// A path inside a repository, put into a GitHub API path one segment at a time: dot-only segments
// are refused by the callers' schema, so the path cannot climb out of `/contents/`.
const contentsPath = (path: string) =>
  path === "" ? "" : `/${path.split("/").map(encodeURIComponent).join("/")}`;

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

const repoPath = (fullName: string) => {
  const [owner, name] = fullName.split("/").map(encodeURIComponent);
  return `/repos/${owner}/${name}`;
};

// A repository the token cannot see is not an error to the caller, only absent.
const nullWhenNotFound = (error: unknown) => {
  if (error instanceof GithubApiError && error.status === 404) return null;
  throw error;
};

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

  /** Replaces the app the client acts as (decision 0074). Installation tokens of the old one are forgotten. */
  configure(config: GithubConfig | null) {
    this.config = config;
    this.#tokens.clear();
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
    return (await this.#get(path, auth, init)).json() as Promise<T>;
  }

  async #get(path: string, auth: string, init: RequestInit = {}) {
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
    return response;
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
   * The latest pull requests of `fullName`, open or not, newest first, whose head branch is
   * `branchPrefix` or starts with it and is in the repository itself, not a fork: what the agent
   * opened with `gh` for a thread (decisions 0044 and 0069). GitHub cannot filter by a prefix, so
   * the newest hundred are read and filtered here. Read with a token for that repository that may
   * only read pull requests, minted for the call; an installation that cannot give one (the
   * permission is not approved) just has none.
   */
  async findPullRequests(installationId: number, fullName: string, branchPrefix: string) {
    const [, name] = fullName.split("/") as [string, string];
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
      if (error instanceof GithubApiError && error.status === 422) return [];
      throw error;
    }
    const query = new URLSearchParams({
      state: "all",
      sort: "created",
      direction: "desc",
      per_page: String(PAGE_SIZE),
    });
    const pulls = await this.#api<PullPayload[]>(`${repoPath(fullName)}/pulls?${query}`, token);
    return pulls
      .filter(
        (pull) =>
          (pull.head.ref === branchPrefix || pull.head.ref.startsWith(`${branchPrefix}-`)) &&
          pull.head.repo?.full_name.toLowerCase() === fullName.toLowerCase(),
      )
      .map((pull): GithubPullRequest => ({
        number: pull.number,
        url: pull.html_url,
        title: pull.title,
        branch: pull.head.ref,
        state: pullState(pull),
      }));
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
    const found = await this.#api<{ permissions?: { push?: boolean } }>(
      repoPath(fullName),
      userToken,
    ).catch(nullWhenNotFound);
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
    const payload = await this.#api<RepoPayload>(repoPath(fullName), token).catch(nullWhenNotFound);
    return payload ? toRepo(payload) : null;
  }

  /**
   * The entries of a folder of the repository's default branch, folders first, or null when the
   * installation cannot see the repository or the path is not a folder there (decision 0082).
   */
  async folder(installationId: number, fullName: string, path: string) {
    const { token } = await this.installationToken(installationId);
    const listed = await this.#api<{ name: string; path: string; type: string }[] | object>(
      `${repoPath(fullName)}/contents${contentsPath(path)}`,
      token,
    ).catch(nullWhenNotFound);
    // A file answers with one object, not a list.
    if (!Array.isArray(listed)) return null;
    const entries = listed.map(({ name, path: entryPath, type }): GithubTreeEntry => ({
      name,
      path: entryPath,
      type: type === "dir" ? "directory" : "file",
    }));
    return entries.sort(
      (a, b) =>
        Number(b.type === "directory") - Number(a.type === "directory") ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }

  /** The README of the repository's default branch as text, or null when it has none or cannot be seen. */
  async readme(installationId: number, fullName: string): Promise<GithubReadme | null> {
    const { token } = await this.installationToken(installationId);
    const found = await this.#api<{
      name: string;
      path: string;
      content?: string;
      encoding?: string;
    }>(`${repoPath(fullName)}/readme`, token).catch(nullWhenNotFound);
    // A file past what GitHub inlines comes with no content.
    if (!found?.content || found.encoding !== "base64") return null;
    const text = Buffer.from(found.content, "base64").toString("utf8");
    return {
      name: found.name,
      path: found.path,
      text: text.slice(0, README_MAX_CHARS),
      truncated: text.length > README_MAX_CHARS,
    };
  }

  /**
   * One page of the default branch's commits, newest first, or null when the installation cannot
   * see the repository. A repository with no commit yet has an empty page. Whether there is an
   * older page is GitHub's own word, its `next` link, so a last page that is exactly full does not
   * offer an empty one.
   */
  async commits(
    installationId: number,
    fullName: string,
    page: number,
    defaultBranch: string,
  ): Promise<GithubCommitPage | null> {
    const { token } = await this.installationToken(installationId);
    const path = `${repoPath(fullName)}/commits?per_page=${COMMITS_PER_PAGE}&page=${page}`;
    // Asked together; the branch names only decorate the page, so they are not worth failing it for.
    const heads = this.#branchHeads(token, fullName, defaultBranch);
    let response: Response;
    try {
      response = await this.#get(path, token);
    } catch (error) {
      // GitHub answers 409 for a repository that has no commit.
      if (error instanceof GithubApiError && error.status === 409) {
        return { commits: [], hasMore: false };
      }
      return nullWhenNotFound(error);
    }
    const listed = (await response.json()) as CommitPayload[];
    const refs = await heads;
    return {
      commits: listed.map(({ sha, commit, author, parents }) => ({
        sha,
        message: commit.message.split("\n")[0]!.trim().slice(0, COMMIT_MESSAGE_MAX),
        author: commit.author?.name ?? author?.login ?? null,
        date: commit.author?.date ?? "",
        parents: parents.map((parent) => parent.sha),
        refs: refs.get(sha) ?? [],
      })),
      hasMore: /rel="next"/.test(response.headers.get("link") ?? ""),
    };
  }

  /**
   * One page of a repository's pull requests or issues, the latest changed first, or null when the
   * installation cannot see the repository. It is GitHub's search, so the page and the total are
   * exact for pull requests and issues apart (the listing endpoint mixes them). Issues need the
   * app's `issues` permission, which an app made before decision 0092 lacks, and search answers
   * nothing, not an error, without it: so the installation's permissions are asked first.
   */
  async tracked(
    installationId: number,
    fullName: string,
    kind: GithubTrackedKind,
    state: GithubTrackedState,
    page: number,
  ): Promise<GithubTrackedPage | null> {
    const { token } = await this.installationToken(installationId);
    if (kind === "issue") await this.#requireIssues(installationId);
    const query = new URLSearchParams({
      q: `repo:${fullName} is:${kind === "pull" ? "pr" : "issue"} is:${state}`,
      sort: "updated",
      order: "desc",
      per_page: String(TRACKED_PER_PAGE),
      page: String(page),
    });
    let found: { total_count: number; items: TrackedPayload[] };
    try {
      found = await this.#api(`/search/issues?${query}`, token);
    } catch (error) {
      // Search answers 422 for a repository the token cannot see, or for a page past the thousandth match.
      if (error instanceof GithubApiError && error.status === 422) {
        return page > 1 ? { items: [], total: 0, hasMore: false } : null;
      }
      throw error;
    }
    return {
      items: found.items.map((item) => ({
        number: item.number,
        title: item.title,
        url: item.html_url,
        author: item.user?.login ?? null,
        status: trackedStatus(item),
        comments: item.comments,
        updatedAt: item.updated_at,
      })),
      total: found.total_count,
      hasMore: page * TRACKED_PER_PAGE < Math.min(found.total_count, SEARCH_MAX_RESULTS),
    };
  }

  async #requireIssues(installationId: number) {
    const found = await this.#api<{
      permissions?: Record<string, string>;
      account?: { login: string };
    }>(`/app/installations/${installationId}`, this.#appJwt());
    if (!found.permissions?.issues) {
      throw new GithubIssuesNotGrantedError(found.account?.login ?? "the account");
    }
  }

  // The branches by the commit each ends on, with the branches that end on the same one in a list.
  // GitHub lists them by name and a repository may have more than a page of them, so the default
  // branch, which the page must show, is asked for by itself too.
  async #branchHeads(token: string, fullName: string, defaultBranch: string) {
    const [listed, main] = await Promise.all([
      this.#api<Branch[]>(
        `${repoPath(fullName)}/branches?per_page=${BRANCHES_LISTED}`,
        token,
      ).catch(() => []),
      this.#api<Branch>(
        `${repoPath(fullName)}/branches/${encodeURIComponent(defaultBranch)}`,
        token,
      ).catch(() => null),
    ]);
    const branches =
      main && !listed.some(({ name }) => name === main.name) ? [...listed, main] : listed;
    const heads = new Map<string, string[]>();
    for (const { name, commit } of branches) {
      const same = heads.get(commit.sha);
      if (same) same.push(name);
      else heads.set(commit.sha, [name]);
    }
    return heads;
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
