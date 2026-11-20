import type { GithubAuth } from "./auth";
import {
  checksOf,
  FILES_LISTED,
  latestReviews,
  REVIEW_THREADS_QUERY,
  shapeFiles,
  TEXT_MAX_CHARS,
  unresolvedComments,
} from "./detail";
import {
  fallbackOnStatuses,
  GithubApiError,
  GithubIssuesNotGrantedError,
  nullWhenNotFound,
} from "./errors";
import type {
  CheckRunsResponsePayload,
  FilePayload,
  PullDetailPayload,
  PullPayload,
  ReviewPayload,
  ReviewThreadsPayload,
  TrackedPayload,
  TrackedSearchPayload,
} from "./payload-types";
import { PAGE_SIZE, repoPath, splitFullName, type GithubTransport } from "./transport";
import type {
  GithubPullDetail,
  GithubPullRequest,
  GithubReviewComment,
  GithubTrackedFilters,
  GithubTrackedItem,
  GithubTrackedKind,
  GithubTrackedPage,
  GithubTrackedState,
} from "./types";

export const TRACKED_PER_PAGE = 10;

const SEARCH_MAX_RESULTS = 1000;
const EXPECTED_PULL_AUX_ERRORS = [403, 404, 409] as const;

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

export class GithubPulls {
  constructor(
    private readonly transport: GithubTransport,
    private readonly auth: GithubAuth,
  ) {}

  async #requireIssues(installationId: number) {
    const found = await this.auth.fetchInstallation(installationId);

    if (!found.permissions?.issues) {
      throw new GithubIssuesNotGrantedError(found.account?.login ?? "the account");
    }
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

    return this.auth.withInstallationToken(installationId, async (token) => {
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
      let found: TrackedSearchPayload;
      try {
        found = await this.transport.get(`/search/issues?${query}`, token);
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
    });
  }

  async findPullRequests(installationId: number, fullName: string, branchPrefix: string) {
    const [, name] = splitFullName(fullName);
    const token = await this.auth.pullReadToken(installationId, name);

    if (token === null) return [];

    const query = new URLSearchParams({
      state: "all",
      sort: "created",
      direction: "desc",
      per_page: String(PAGE_SIZE),
    });
    const pulls = await this.transport.get<PullPayload[]>(
      `${repoPath(fullName)}/pulls?${query}`,
      token,
    );
    return pulls.flatMap((pull) =>
      (pull.head.ref === branchPrefix || pull.head.ref.startsWith(`${branchPrefix}-`)) &&
      pull.head.repo?.full_name.toLowerCase() === fullName.toLowerCase()
        ? [asPullRequest(pull)]
        : [],
    );
  }

  async branchPullRequests(installationId: number, fullName: string, branch: string) {
    const [owner, name] = splitFullName(fullName);
    const token = await this.auth.pullReadToken(installationId, name);

    if (token === null) return null;

    const query = new URLSearchParams({
      state: "all",
      head: `${owner}:${branch}`,
      per_page: String(PAGE_SIZE),
    });
    const pulls = await this.transport.get<PullPayload[]>(
      `${repoPath(fullName)}/pulls?${query}`,
      token,
    );
    return pulls.flatMap((pull) =>
      pull.head.ref === branch && pull.head.repo?.full_name.toLowerCase() === fullName.toLowerCase()
        ? [asPullRequest(pull)]
        : [],
    );
  }

  async pull(
    installationId: number,
    fullName: string,
    number: number,
  ): Promise<GithubPullDetail | null> {
    return this.auth.withInstallationToken(installationId, async (token) => {
      const path = `${repoPath(fullName)}/pulls/${number}`;
      try {
        const pull = await this.transport.get<PullDetailPayload>(path, token);
        const [files, reviews, runs] = await Promise.all([
          this.transport.get<FilePayload[]>(`${path}/files?per_page=${FILES_LISTED}`, token),
          this.transport
            .get<ReviewPayload[]>(`${path}/reviews?per_page=100`, token)
            .catch(fallbackOnStatuses(EXPECTED_PULL_AUX_ERRORS, [])),
          this.transport
            .get<CheckRunsResponsePayload>(
              `${repoPath(fullName)}/commits/${pull.head.sha}/check-runs?per_page=100`,
              token,
            )
            .then((found) => found.check_runs)
            .catch(fallbackOnStatuses(EXPECTED_PULL_AUX_ERRORS, null)),
        ]);
        const shapedFiles = shapeFiles(files);
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
          files: shapedFiles,
          filesTruncated: pull.changed_files > shapedFiles.length || files.length > FILES_LISTED,
        };
      } catch (error) {
        return nullWhenNotFound(error);
      }
    });
  }

  async unresolvedReviewComments(
    installationId: number,
    fullName: string,
    number: number,
  ): Promise<GithubReviewComment[]> {
    const [owner, name] = splitFullName(fullName);
    return this.auth.withInstallationToken(installationId, async (token) => {
      const payload = await this.transport.graphql<ReviewThreadsPayload>(
        token,
        REVIEW_THREADS_QUERY,
        { owner, name, number },
      );

      if (payload.errors?.length) {
        throw new GithubApiError("GitHub could not list the reviews", 502);
      }

      return unresolvedComments(payload);
    });
  }
}
