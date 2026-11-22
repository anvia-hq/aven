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
  CheckRunPayload,
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
  GithubCheckLogResult,
  GithubCreatePullInput,
  GithubMergePullInput,
  GithubMergePullResult,
  GithubPullDetail,
  GithubPullListEntry,
  GithubPullRequest,
  GithubReviewComment,
  GithubReviewPullInput,
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

  async listPulls(
    installationId: number,
    fullName: string,
    state: "open" | "closed" | "all" = "open",
  ): Promise<GithubPullListEntry[]> {
    return this.auth.withInstallationToken(installationId, async (token) => {
      const query = new URLSearchParams({
        state,
        sort: "updated",
        direction: "desc",
        per_page: "50",
      });
      const pulls = await this.transport.get<
        (PullDetailPayload & { head: { ref: string; sha: string }; base: { ref: string } })[]
      >(`${repoPath(fullName)}/pulls?${query}`, token);
      return pulls.map((pull) => ({
        number: pull.number,
        title: pull.title,
        url: pull.html_url,
        author: pull.user?.login ?? null,
        status: pullStatus(pull),
        head: pull.head.ref,
        headSha: pull.head.sha,
        base: pull.base.ref,
        updatedAt: pull.updated_at,
      }));
    });
  }

  async createPull(
    userToken: string,
    fullName: string,
    input: GithubCreatePullInput,
  ): Promise<GithubPullRequest> {
    const pull = await this.transport.post<PullPayload>(`${repoPath(fullName)}/pulls`, userToken, {
      title: input.title,
      body: input.body ?? "",
      head: input.head,
      base: input.base,
      draft: input.draft ?? false,
    });
    return asPullRequest(pull);
  }

  async reviewPull(
    userToken: string,
    fullName: string,
    number: number,
    input: GithubReviewPullInput,
  ): Promise<{ ok: true }> {
    await this.transport.post(`${repoPath(fullName)}/pulls/${number}/reviews`, userToken, {
      event: input.event,
      body: input.body ?? "",
    });
    return { ok: true };
  }

  async mergePull(
    userToken: string,
    fullName: string,
    number: number,
    input: GithubMergePullInput,
  ): Promise<GithubMergePullResult> {
    if (input.method === "enqueue") {
      const detail = await this.transport.get<PullDetailPayload>(
        `${repoPath(fullName)}/pulls/${number}`,
        userToken,
      );

      if (!detail.node_id) {
        throw new GithubApiError("Pull request node ID unavailable for merge queue", 422);
      }

      const result = await this.transport.graphql<{
        data?: { enqueuePullRequest?: { mergeQueueEntry?: { id: string; state: string } } };
        errors?: { message: string }[];
      }>(
        userToken,
        "mutation($id:ID!){enqueuePullRequest(input:{pullRequestId:$id}){mergeQueueEntry{id state}}}",
        { id: detail.node_id },
      );

      if (result.errors?.length) {
        throw new GithubApiError(
          result.errors[0]?.message ?? "Could not enqueue pull request",
          422,
        );
      }

      return {
        merged: false,
        queued: true,
        message: "Enqueued pull request in merge queue",
      };
    }

    const body: Record<string, string> = { merge_method: input.method };

    if (input.commitTitle) body.commit_title = input.commitTitle;

    if (input.commitMessage) body.commit_message = input.commitMessage;

    const result = await this.transport.putJson<{
      merged: boolean;
      message: string;
      sha?: string;
    }>(`${repoPath(fullName)}/pulls/${number}/merge`, userToken, body);
    return {
      merged: result.merged,
      queued: false,
      message: result.message,
      sha: result.sha,
    };
  }

  async updatePullBranch(
    userToken: string,
    fullName: string,
    number: number,
  ): Promise<{ message: string }> {
    const result = await this.transport.putJson<{ message?: string }>(
      `${repoPath(fullName)}/pulls/${number}/update-branch`,
      userToken,
      {},
    );
    return { message: result.message ?? "Updated pull request branch" };
  }

  async updatePullState(
    userToken: string,
    fullName: string,
    number: number,
    state: "open" | "closed",
  ): Promise<GithubPullRequest> {
    const pull = await this.transport.patch<PullPayload>(
      `${repoPath(fullName)}/pulls/${number}`,
      userToken,
      { state },
    );
    return asPullRequest(pull);
  }

  async checkRunLogs(
    authToken: string,
    fullName: string,
    checkRunId: number,
  ): Promise<GithubCheckLogResult> {
    const run = await this.transport.get<CheckRunPayload>(
      `${repoPath(fullName)}/check-runs/${checkRunId}`,
      authToken,
    );
    let logs: string | null = null;
    try {
      const text = await this.transport.getText(
        `${repoPath(fullName)}/actions/jobs/${checkRunId}/logs`,
        authToken,
      );
      const maxChars = 16_000;
      logs = text.length > maxChars ? text.slice(-maxChars) : text;
    } catch {
      logs = null;
    }
    return {
      checkRunId,
      name: run.name,
      summary: run.output?.summary ?? run.output?.title ?? null,
      text: run.output?.text ? run.output.text.slice(0, 16_000) : null,
      logs,
      url: run.html_url,
    };
  }
}
