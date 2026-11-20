import type { GithubAuth } from "./auth";
import { BRANCH_CALLS_AT_ONCE, BRANCHES_SUMMARIZED, mapLimit, pullsByBranch } from "./branches";
import { FILES_LISTED, shapeFiles, TEXT_MAX_CHARS } from "./detail";
import { fallbackOnStatuses, GithubApiError, nullWhenNotFound } from "./errors";
import type {
  BranchListEntryPayload,
  CommitDetailPayload,
  CommitPayload,
  ComparePayload,
  OpenPullPayload,
  RefHeadPayload,
} from "./payload-types";
import { hasNextLink, repoPath, type GithubTransport } from "./transport";
import type {
  GithubBranchSummary,
  GithubCommitDetail,
  GithubCommitFilters,
  GithubCommitPage,
} from "./types";

export const COMMITS_PER_PAGE = 10;

const COMMIT_MESSAGE_MAX = 200;
const BRANCHES_LISTED = 100;

const EXPECTED_BRANCH_ERRORS = [403, 404, 409] as const;
const EXPECTED_COMPARE_ERRORS = [403, 404, 409, 422] as const;

function groupBySha(refs: RefHeadPayload[]) {
  const heads = new Map<string, string[]>();
  for (const { name, commit } of refs) {
    const same = heads.get(commit.sha);

    if (same) same.push(name);
    else heads.set(commit.sha, [name]);
  }
  return heads;
}

function formatCommitSummary(item: CommitPayload) {
  return {
    sha: item.sha,
    message: item.commit.message.split("\n")[0]!.trim().slice(0, COMMIT_MESSAGE_MAX),
    author: item.commit.author?.name ?? item.author?.login ?? null,
    date: item.commit.author?.date ?? "",
  };
}

function fallbackDecorativeRefError<T>(fallback: T) {
  return (error: unknown): T => {
    if (error instanceof GithubApiError && error.status !== 401 && error.status !== 429) {
      return fallback;
    }

    throw error;
  };
}

export class GithubCommits {
  constructor(
    private readonly transport: GithubTransport,
    private readonly auth: GithubAuth,
  ) {}

  async commits(
    installationId: number,
    fullName: string,
    page: number,
    defaultBranch: string,
    filters: GithubCommitFilters = {},
  ): Promise<GithubCommitPage | null> {
    return this.auth.withInstallationToken(installationId, async (token) => {
      const query = new URLSearchParams({
        per_page: String(COMMITS_PER_PAGE),
        page: String(page),
      });

      if (filters.author) query.set("author", filters.author);

      if (filters.since) query.set("since", filters.since);

      if (filters.until) query.set("until", filters.until);

      if (filters.path) query.set("path", filters.path);

      if (filters.branch) query.set("sha", filters.branch);

      const path = `${repoPath(fullName)}/commits?${query}`;
      let response: Response;
      try {
        response = await this.transport.request(path, token);
      } catch (error) {
        if (error instanceof GithubApiError && error.status === 409) {
          return { commits: [], hasMore: false };
        }

        return nullWhenNotFound(error);
      }
      const listed = (await response.json()) as CommitPayload[];
      const hasMore = hasNextLink(response.headers.get("link"));

      if (listed.length === 0) return { commits: [], hasMore };

      const [refs, tagged] = await Promise.all([
        this.#branchHeads(token, fullName, defaultBranch),
        this.#tagHeads(token, fullName),
      ]);
      return {
        commits: listed.map((item) => ({
          ...formatCommitSummary(item),
          authorAvatar: item.author?.avatar_url ?? null,
          parents: item.parents.map((parent) => parent.sha),
          refs: refs.get(item.sha) ?? [],
          tags: tagged.get(item.sha) ?? [],
        })),
        hasMore,
      };
    });
  }

  async commit(
    installationId: number,
    fullName: string,
    sha: string,
  ): Promise<GithubCommitDetail | null> {
    return this.auth.withInstallationToken(installationId, async (token) => {
      try {
        const found = await this.transport.get<CommitDetailPayload>(
          `${repoPath(fullName)}/commits/${encodeURIComponent(sha)}`,
          token,
        );
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
          filesTruncated: files.length > FILES_LISTED,
        };
      } catch (error) {
        return nullWhenNotFound(error);
      }
    });
  }

  async branches(
    installationId: number,
    fullName: string,
    defaultBranch: string,
  ): Promise<{ branches: GithubBranchSummary[]; truncated: boolean } | null> {
    return this.auth.withInstallationToken(installationId, async (token) => {
      const repo = repoPath(fullName);
      let listed: BranchListEntryPayload[];
      try {
        listed = await this.transport.get(`${repo}/branches?per_page=100`, token);
      } catch (error) {
        return nullWhenNotFound(error);
      }
      const pulls = await this.transport
        .get<OpenPullPayload[]>(`${repo}/pulls?state=open&per_page=100`, token)
        .catch(fallbackOnStatuses(EXPECTED_BRANCH_ERRORS, []));
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
          this.transport
            .get<CommitPayload>(`${repo}/commits/${name}`, token)
            .catch(fallbackOnStatuses(EXPECTED_BRANCH_ERRORS, null)),
          isDefault
            ? null
            : this.transport
                .get<ComparePayload>(
                  `${repo}/compare/${encodeURIComponent(defaultBranch)}...${name}?per_page=1`,
                  token,
                )
                .catch(fallbackOnStatuses(EXPECTED_COMPARE_ERRORS, null)),
        ]);
        return {
          name: branch.name,
          isDefault,
          protected: branch.protected,
          ahead: compared?.ahead_by ?? 0,
          behind: compared?.behind_by ?? 0,
          lastCommit: head ? formatCommitSummary(head) : null,
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
    });
  }

  async #tagHeads(token: string, fullName: string) {
    const listed = await this.transport
      .get<RefHeadPayload[]>(`${repoPath(fullName)}/tags?per_page=${BRANCHES_LISTED}`, token)
      .catch(fallbackDecorativeRefError([]));
    return groupBySha(listed);
  }

  async #branchHeads(token: string, fullName: string, defaultBranch: string) {
    const [listed, main] = await Promise.all([
      this.transport
        .get<RefHeadPayload[]>(`${repoPath(fullName)}/branches?per_page=${BRANCHES_LISTED}`, token)
        .catch(fallbackDecorativeRefError([])),
      this.transport
        .get<RefHeadPayload>(
          `${repoPath(fullName)}/branches/${encodeURIComponent(defaultBranch)}`,
          token,
        )
        .catch(fallbackDecorativeRefError(null)),
    ]);
    const branches =
      main && !listed.some(({ name }) => name === main.name) ? [...listed, main] : listed;
    return groupBySha(branches);
  }
}
