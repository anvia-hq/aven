import { createSign } from "node:crypto";

import { ConflictError, UnavailableError } from "@aven/server-kit/errors";

export class GithubNotConfiguredError extends UnavailableError {
  constructor() {
    super("GitHub is not configured on this control plane");
  }
}

export class GithubWriteNotGrantedError extends ConflictError {
  constructor(accountLogin: string) {
    super(
      `The Aven app has not been approved to write to ${accountLogin} on GitHub. Approve its new permissions there, then try again.`,
    );
  }
}

export class GithubIssuesNotGrantedError extends ConflictError {
  constructor(accountLogin: string) {
    super(
      `The Aven app has not been approved to read issues on ${accountLogin} on GitHub. Approve its new permissions there to list them here.`,
    );
  }
}

export class GithubNoPushAccessError extends ConflictError {
  constructor(fullName: string) {
    super(`You do not have write access to ${fullName} on GitHub`);
  }
}

class GithubApiError extends UnavailableError {
  constructor(
    message: string,
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

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const TOKEN_MARGIN_MS = 5 * 60_000;

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

function asPullRequest(pull: PullPayload): GithubPullRequest {
  return {
    number: pull.number,
    url: pull.html_url,
    title: pull.title,
    branch: pull.head.ref,
    state: pullState(pull),
  };
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

import { BRANCH_CALLS_AT_ONCE, BRANCHES_SUMMARIZED, mapLimit, pullsByBranch } from "./branches";
import { checksOf, latestReviews, shapeFiles, TEXT_MAX_CHARS } from "./detail";
import type {
  CheckRunPayload,
  FilePayload,
  GithubBranchSummary,
  GithubCommitDetail,
  GithubCommitFilters,
  GithubCommitPage,
  GithubConfig,
  GithubPullDetail,
  GithubPullRequest,
  GithubReadme,
  GithubTrackedFilters,
  GithubTrackedItem,
  GithubTrackedKind,
  GithubTrackedPage,
  GithubTrackedState,
  GithubTreeEntry,
  GithubUserGrant,
  GithubUserProfile,
  OpenPullPayload,
  ReviewPayload,
} from "./types";

export const README_MAX_CHARS = 200_000;

export const COMMITS_PER_PAGE = 10;
const COMMIT_MESSAGE_MAX = 200;

export const TRACKED_PER_PAGE = 10;
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
  labels?: { name: string }[];
  pull_request?: { merged_at: string | null };
};

const SORTS = {
  updated: { sort: "updated", order: "desc" },
  oldest: { sort: "updated", order: "asc" },
  created: { sort: "created", order: "desc" },
  comments: { sort: "comments", order: "desc" },
} as const;

export function trackedQualifiers(filters: GithubTrackedFilters, now = Date.now()) {
  const parts: string[] = [];
  const quoted = (value: string) => `"${value.replaceAll('"', "")}"`;

  if (filters.author) parts.push(`author:${filters.author}`);

  if (filters.reviewRequested) parts.push(`review-requested:${filters.reviewRequested}`);

  if (filters.review) parts.push(`review:${filters.review}`);

  if (filters.checks) parts.push(`status:${filters.checks}`);

  if (filters.label) parts.push(`label:${quoted(filters.label)}`);

  if (filters.draft !== undefined) parts.push(`draft:${filters.draft}`);

  if (filters.staleDays) {
    const before = new Date(now - filters.staleDays * 86_400_000).toISOString().slice(0, 10);
    parts.push(`updated:<${before}`);
  }

  const words = filters.text?.replace(/[:"\\]/g, " ").trim();

  if (words) parts.push(`${words} in:title`);

  return parts;
}

function trackedStatus(item: TrackedPayload): GithubTrackedItem["status"] {
  if (item.pull_request?.merged_at) return "merged";

  if (item.state !== "open") return "closed";

  return item.draft ? "draft" : "open";
}

function pullStatus(pull: { merged?: boolean; state: string; draft?: boolean }) {
  if (pull.merged) return "merged";

  if (pull.state !== "open") return "closed";

  return pull.draft ? "draft" : "open";
}

type CommitPayload = {
  sha: string;
  commit: { message: string; author: { name: string; date: string } | null };
  author: { login: string; avatar_url?: string } | null;
  parents: { sha: string }[];
};

type Branch = { name: string; commit: { sha: string } };

const BRANCHES_LISTED = 100;

const contentsPath = (path: string) =>
  path === "" ? "" : `/${path.split("/").map(encodeURIComponent).join("/")}`;

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

const repoPath = (fullName: string) => {
  const [owner, name] = fullName.split("/").map(encodeURIComponent);
  return `/repos/${owner}/${name}`;
};

const nullWhenNotFound = (error: unknown) => {
  if (error instanceof GithubApiError && error.status === 404) return null;

  throw error;
};

export class GithubClient {
  #tokens = new Map<number, { token: string; expiresAt: number }>();

  constructor(
    private config: GithubConfig | null,
    private fetchImpl: Fetch = fetch,
  ) {}

  get configured() {
    return this.config !== null;
  }

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

  async *#pages<P, T>(path: string, auth: string, entriesOf: (page: P) => T[]) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const entries = entriesOf(
        await this.#api<P>(`${path}?per_page=${PAGE_SIZE}&page=${page}`, auth),
      );
      yield* entries;

      if (entries.length < PAGE_SIZE) return;
    }
  }

  async installation(installationId: number) {
    const found = await this.#api<{ id: number; account: { login: string } | null }>(
      `/app/installations/${installationId}`,
      this.#appJwt(),
    );
    return { installationId: found.id, accountLogin: found.account?.login ?? "unknown" };
  }

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

  authorizeUrl(state: string) {
    const { clientId, webUrl } = this.#config();
    return `${webUrl}/login/oauth/authorize?${new URLSearchParams({ client_id: clientId, state })}`;
  }

  async #readToken(installationId: number, name: string) {
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
      return issued.token;
    } catch (error) {
      if (error instanceof GithubApiError && error.status === 422) return null;

      throw error;
    }
  }

  async findPullRequests(installationId: number, fullName: string, branchPrefix: string) {
    const [, name] = fullName.split("/") as [string, string];
    const token = await this.#readToken(installationId, name);

    if (token === null) return [];

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
      .map(asPullRequest);
  }

  async branchPullRequests(installationId: number, fullName: string, branch: string) {
    const [owner, name] = fullName.split("/") as [string, string];
    const token = await this.#readToken(installationId, name);

    if (token === null) return null;

    const query = new URLSearchParams({
      state: "all",
      head: `${owner}:${branch}`,
      per_page: String(PAGE_SIZE),
    });
    const pulls = await this.#api<PullPayload[]>(`${repoPath(fullName)}/pulls?${query}`, token);
    return pulls
      .filter(
        (pull) =>
          pull.head.ref === branch &&
          pull.head.repo?.full_name.toLowerCase() === fullName.toLowerCase(),
      )
      .map(asPullRequest);
  }

  async canWrite(installationId: number) {
    const found = await this.#api<{ permissions?: Record<string, string> }>(
      `/app/installations/${installationId}`,
      this.#appJwt(),
    );
    return found.permissions?.contents === "write" && found.permissions?.pull_requests === "write";
  }

  async canPush(userToken: string, fullName: string) {
    const found = await this.#api<{ permissions?: { push?: boolean } }>(
      repoPath(fullName),
      userToken,
    ).catch(nullWhenNotFound);
    return found?.permissions?.push === true;
  }

  async folder(installationId: number, fullName: string, path: string) {
    const { token } = await this.installationToken(installationId);
    const listed = await this.#api<{ name: string; path: string; type: string }[] | object>(
      `${repoPath(fullName)}/contents${contentsPath(path)}`,
      token,
    ).catch(nullWhenNotFound);

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

  async readme(installationId: number, fullName: string): Promise<GithubReadme | null> {
    const { token } = await this.installationToken(installationId);
    const found = await this.#api<{
      name: string;
      path: string;
      content?: string;
      encoding?: string;
    }>(`${repoPath(fullName)}/readme`, token).catch(nullWhenNotFound);

    if (!found?.content || found.encoding !== "base64") return null;

    const text = Buffer.from(found.content, "base64").toString("utf8");
    return {
      name: found.name,
      path: found.path,
      text: text.slice(0, README_MAX_CHARS),
      truncated: text.length > README_MAX_CHARS,
    };
  }

  async commits(
    installationId: number,
    fullName: string,
    page: number,
    defaultBranch: string,
    filters: GithubCommitFilters = {},
  ): Promise<GithubCommitPage | null> {
    const { token } = await this.installationToken(installationId);
    const query = new URLSearchParams({ per_page: String(COMMITS_PER_PAGE), page: String(page) });

    if (filters.author) query.set("author", filters.author);

    if (filters.since) query.set("since", filters.since);

    if (filters.until) query.set("until", filters.until);

    if (filters.path) query.set("path", filters.path);

    if (filters.branch) query.set("sha", filters.branch);

    const path = `${repoPath(fullName)}/commits?${query}`;
    const heads = this.#branchHeads(token, fullName, defaultBranch);
    const tags = this.#tagHeads(token, fullName);
    let response: Response;
    try {
      response = await this.#get(path, token);
    } catch (error) {
      if (error instanceof GithubApiError && error.status === 409) {
        return { commits: [], hasMore: false };
      }

      return nullWhenNotFound(error);
    }
    const listed = (await response.json()) as CommitPayload[];
    const [refs, tagged] = await Promise.all([heads, tags]);
    return {
      commits: listed.map(({ sha, commit, author, parents }) => ({
        sha,
        message: commit.message.split("\n")[0]!.trim().slice(0, COMMIT_MESSAGE_MAX),
        author: commit.author?.name ?? author?.login ?? null,
        authorAvatar: author?.avatar_url ?? null,
        date: commit.author?.date ?? "",
        parents: parents.map((parent) => parent.sha),
        refs: refs.get(sha) ?? [],
        tags: tagged.get(sha) ?? [],
      })),
      hasMore: /rel="next"/.test(response.headers.get("link") ?? ""),
    };
  }

  async tracked(
    installationId: number,
    fullName: string,
    kind: GithubTrackedKind,
    state: GithubTrackedState,
    page: number,
    filters: GithubTrackedFilters = {},
  ): Promise<GithubTrackedPage | null> {
    if (kind === "issue") await this.#requireIssues(installationId);

    const { token } = await this.installationToken(installationId);
    const qualifiers = [`repo:${fullName}`, `is:${kind === "pull" ? "pr" : "issue"}`];

    if (state !== "all") qualifiers.push(`is:${state}`);

    const applicable =
      kind === "pull"
        ? filters
        : { ...filters, review: undefined, checks: undefined, draft: undefined };
    qualifiers.push(...trackedQualifiers(applicable));
    const query = new URLSearchParams({
      q: qualifiers.join(" "),
      ...SORTS[filters.sort ?? "updated"],
      per_page: String(TRACKED_PER_PAGE),
      page: String(page),
    });
    let found: { total_count: number; items: TrackedPayload[] };
    try {
      found = await this.#api(`/search/issues?${query}`, token);
    } catch (error) {
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
        labels: (item.labels ?? []).map(({ name }) => name),
      })),
      total: found.total_count,
      hasMore: page * TRACKED_PER_PAGE < Math.min(found.total_count, SEARCH_MAX_RESULTS),
    };
  }

  async pull(
    installationId: number,
    fullName: string,
    number: number,
  ): Promise<GithubPullDetail | null> {
    const { token } = await this.installationToken(installationId);
    const path = `${repoPath(fullName)}/pulls/${number}`;
    try {
      const pull = await this.#api<{
        number: number;
        title: string;
        body: string | null;
        html_url: string;
        state: string;
        draft?: boolean;
        merged?: boolean;
        user: { login: string } | null;
        base: { ref: string };
        head: { ref: string; sha: string };
        additions: number;
        deletions: number;
        changed_files: number;
        commits: number;
        comments: number;
        review_comments?: number;
        created_at: string;
        updated_at: string;
        mergeable: boolean | null;
        requested_reviewers?: { login: string }[];
      }>(path, token);
      const [files, reviews, runs] = await Promise.all([
        this.#api<FilePayload[]>(`${path}/files?per_page=100`, token),
        this.#api<ReviewPayload[]>(`${path}/reviews?per_page=100`, token).catch(() => []),
        this.#api<{ check_runs: CheckRunPayload[] }>(
          `${repoPath(fullName)}/commits/${pull.head.sha}/check-runs?per_page=100`,
          token,
        )
          .then((found) => found.check_runs)
          .catch(() => null),
      ]);
      return {
        number: pull.number,
        title: pull.title,
        body: (pull.body ?? "").slice(0, TEXT_MAX_CHARS),
        url: pull.html_url,
        status: pullStatus(pull),
        author: pull.user?.login ?? null,
        base: pull.base.ref,
        head: pull.head.ref,
        additions: pull.additions,
        deletions: pull.deletions,
        changedFiles: pull.changed_files,
        commits: pull.commits,
        comments: pull.comments + (pull.review_comments ?? 0),
        createdAt: pull.created_at,
        updatedAt: pull.updated_at,
        mergeable: pull.mergeable,
        reviews: latestReviews(reviews),
        requestedReviewers: (pull.requested_reviewers ?? []).map(({ login }) => login),
        checks: checksOf(runs),
        files: shapeFiles(files),
        filesTruncated: pull.changed_files > files.length || files.length > 100,
      };
    } catch (error) {
      return nullWhenNotFound(error);
    }
  }

  async commit(
    installationId: number,
    fullName: string,
    sha: string,
  ): Promise<GithubCommitDetail | null> {
    const { token } = await this.installationToken(installationId);
    try {
      const found = await this.#api<
        CommitPayload & {
          html_url: string;
          stats?: { additions: number; deletions: number };
          files?: FilePayload[];
        }
      >(`${repoPath(fullName)}/commits/${encodeURIComponent(sha)}`, token);
      const files = found.files ?? [];
      return {
        sha: found.sha,
        message: found.commit.message.trim().slice(0, TEXT_MAX_CHARS),
        author: found.commit.author?.name ?? found.author?.login ?? null,
        date: found.commit.author?.date ?? "",
        url: found.html_url,
        parents: found.parents.map((parent) => parent.sha),
        additions: found.stats?.additions ?? 0,
        deletions: found.stats?.deletions ?? 0,
        files: shapeFiles(files),
        filesTruncated: files.length > 100,
      };
    } catch (error) {
      return nullWhenNotFound(error);
    }
  }

  async branches(
    installationId: number,
    fullName: string,
    defaultBranch: string,
  ): Promise<{ branches: GithubBranchSummary[]; truncated: boolean } | null> {
    const { token } = await this.installationToken(installationId);
    const repo = repoPath(fullName);
    let listed: { name: string; protected: boolean }[];
    try {
      listed = await this.#api(`${repo}/branches?per_page=100`, token);
    } catch (error) {
      return nullWhenNotFound(error);
    }
    const pulls = await this.#api<OpenPullPayload[]>(
      `${repo}/pulls?state=open&per_page=100`,
      token,
    ).catch(() => []);
    const pullOf = pullsByBranch(pulls, fullName);

    const ordered = [
      ...listed.filter((branch) => branch.name === defaultBranch),
      ...listed.filter((branch) => branch.name !== defaultBranch),
    ];
    const looked = ordered.slice(0, BRANCHES_SUMMARIZED);
    const summaries = await mapLimit(looked, BRANCH_CALLS_AT_ONCE, async (branch) => {
      const name = encodeURIComponent(branch.name);
      const isDefault = branch.name === defaultBranch;
      const [head, compared] = await Promise.all([
        this.#api<CommitPayload>(`${repo}/commits/${name}`, token).catch(() => null),
        isDefault
          ? null
          : this.#api<{ ahead_by: number; behind_by: number }>(
              `${repo}/compare/${encodeURIComponent(defaultBranch)}...${name}?per_page=1`,
              token,
            ).catch(() => null),
      ]);
      return {
        name: branch.name,
        isDefault,
        protected: branch.protected,
        ahead: compared?.ahead_by ?? 0,
        behind: compared?.behind_by ?? 0,
        lastCommit: head
          ? {
              sha: head.sha,
              message: head.commit.message.split("\n")[0]!.trim().slice(0, COMMIT_MESSAGE_MAX),
              author: head.commit.author?.name ?? head.author?.login ?? null,
              date: head.commit.author?.date ?? "",
            }
          : null,
        pull: pullOf.get(branch.name) ?? null,
      } satisfies GithubBranchSummary;
    });
    const [first, ...others] = summaries;
    const rest = first?.isDefault ? others : summaries;
    rest.sort((a, b) => (b.lastCommit?.date ?? "").localeCompare(a.lastCommit?.date ?? ""));
    return {
      branches: first?.isDefault ? [first, ...rest] : rest,
      truncated: listed.length > BRANCHES_SUMMARIZED,
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

  async #tagHeads(token: string, fullName: string) {
    const listed = await this.#api<{ name: string; commit: { sha: string } }[]>(
      `${repoPath(fullName)}/tags?per_page=${BRANCHES_LISTED}`,
      token,
    ).catch(() => []);
    const heads = new Map<string, string[]>();
    for (const { name, commit } of listed) {
      const same = heads.get(commit.sha);

      if (same) same.push(name);
      else heads.set(commit.sha, [name]);
    }
    return heads;
  }

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

  async userCanUse(userToken: string, installationId: number) {
    const installations = this.#pages(
      "/user/installations",
      userToken,
      (page: { installations: { id: number }[] }) => page.installations,
    );
    for await (const entry of installations) if (entry.id === installationId) return true;
    return false;
  }

  exchangeCode(code: string) {
    return this.#grant({ code });
  }

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

  async #grant(params: Record<string, string>): Promise<GithubUserGrant | null> {
    const { clientId, clientSecret, webUrl } = this.#config();
    const exchange = await this.fetchImpl(`${webUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...params }),
    }).catch(() => {
      throw new UnavailableError("Could not reach GitHub");
    });

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
