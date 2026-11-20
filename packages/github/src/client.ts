import { GithubAuth } from "./auth";
import { COMMITS_PER_PAGE, GithubCommits } from "./commits";
import {
  GithubApiError,
  GithubCreateNotGrantedError,
  GithubIssuesNotGrantedError,
  GithubNoPushAccessError,
  GithubNotConfiguredError,
  GithubRepositoryNotCreatedError,
  GithubUserRequiredError,
  GithubWriteNotGrantedError,
} from "./errors";
import { GithubPulls, TRACKED_PER_PAGE, trackedQualifiers } from "./pulls";
import { GithubRepositories, README_MAX_CHARS } from "./repositories";
import { githubConfigFromEnv, GithubTransport } from "./transport";
import type {
  GithubBranchSummary,
  GithubCommitDetail,
  GithubCommitFilters,
  GithubCommitPage,
  GithubConfig,
  GithubCreateRepositoryInput,
  GithubFetch,
  GithubFile,
  GithubInstallation,
  GithubNewRepository,
  GithubPullDetail,
  GithubPullRequest,
  GithubReadme,
  GithubRepository,
  GithubReviewComment,
  GithubTrackedFilters,
  GithubTrackedKind,
  GithubTrackedPage,
  GithubTrackedState,
  GithubTreeEntry,
  GithubUserGrant,
  GithubUserProfile,
} from "./types";

export {
  COMMITS_PER_PAGE,
  GithubApiError,
  GithubCreateNotGrantedError,
  GithubIssuesNotGrantedError,
  GithubNoPushAccessError,
  GithubNotConfiguredError,
  GithubRepositoryNotCreatedError,
  GithubUserRequiredError,
  GithubWriteNotGrantedError,
  githubConfigFromEnv,
  README_MAX_CHARS,
  TRACKED_PER_PAGE,
  trackedQualifiers,
};

export class GithubClient {
  #transport: GithubTransport;
  #auth: GithubAuth;
  #repositories: GithubRepositories;
  #commits: GithubCommits;
  #pulls: GithubPulls;

  constructor(config: GithubConfig | null, fetchImpl: GithubFetch = fetch) {
    this.#transport = new GithubTransport(config, fetchImpl);
    this.#auth = new GithubAuth(this.#transport);
    this.#repositories = new GithubRepositories(this.#transport, this.#auth);
    this.#commits = new GithubCommits(this.#transport, this.#auth);
    this.#pulls = new GithubPulls(this.#transport, this.#auth);
  }

  get configured() {
    return this.#transport.configured;
  }

  configure(config: GithubConfig | null) {
    this.#transport.configure(config);
    this.#auth.clear();
  }

  get slug() {
    return this.#transport.slug;
  }

  get webUrl() {
    return this.#transport.webUrl;
  }

  repositories(installationId: number): Promise<GithubRepository[]> {
    return this.#repositories.repositories(installationId);
  }

  installation(installationId: number): Promise<GithubInstallation> {
    return this.#repositories.installation(installationId);
  }

  createRepository(
    installationId: number,
    input: GithubCreateRepositoryInput,
  ): Promise<GithubNewRepository> {
    return this.#repositories.createRepository(installationId, input);
  }

  addRepositoryToInstallation(installationId: number, userToken: string, repositoryId: number) {
    return this.#repositories.addRepositoryToInstallation(installationId, userToken, repositoryId);
  }

  canReach(installationId: number, fullName: string) {
    return this.#repositories.canReach(installationId, fullName);
  }

  installationToken(installationId: number) {
    return this.#auth.installationToken(installationId);
  }

  authorizeUrl(state: string) {
    return this.#auth.authorizeUrl(state);
  }

  findPullRequests(
    installationId: number,
    fullName: string,
    branchPrefix: string,
  ): Promise<GithubPullRequest[]> {
    return this.#pulls.findPullRequests(installationId, fullName, branchPrefix);
  }

  branchPullRequests(
    installationId: number,
    fullName: string,
    branch: string,
  ): Promise<GithubPullRequest[] | null> {
    return this.#pulls.branchPullRequests(installationId, fullName, branch);
  }

  canWrite(installationId: number) {
    return this.#repositories.canWrite(installationId);
  }

  canPush(userToken: string, fullName: string) {
    return this.#repositories.canPush(userToken, fullName);
  }

  folder(
    installationId: number,
    fullName: string,
    path: string,
  ): Promise<GithubTreeEntry[] | null> {
    return this.#repositories.folder(installationId, fullName, path);
  }

  readme(installationId: number, fullName: string): Promise<GithubReadme | null> {
    return this.#repositories.readme(installationId, fullName);
  }

  file(
    installationId: number,
    fullName: string,
    path: string,
    maxChars: number,
  ): Promise<GithubFile | null> {
    return this.#repositories.file(installationId, fullName, path, maxChars);
  }

  commits(
    installationId: number,
    fullName: string,
    page: number,
    defaultBranch: string,
    filters: GithubCommitFilters = {},
  ): Promise<GithubCommitPage | null> {
    return this.#commits.commits(installationId, fullName, page, defaultBranch, filters);
  }

  tracked(
    installationId: number,
    fullName: string,
    kind: GithubTrackedKind,
    state: GithubTrackedState,
    page: number,
    filters: GithubTrackedFilters = {},
  ): Promise<GithubTrackedPage | null> {
    return this.#pulls.tracked(installationId, fullName, kind, state, page, filters);
  }

  pull(installationId: number, fullName: string, number: number): Promise<GithubPullDetail | null> {
    return this.#pulls.pull(installationId, fullName, number);
  }

  unresolvedReviewComments(
    installationId: number,
    fullName: string,
    number: number,
  ): Promise<GithubReviewComment[]> {
    return this.#pulls.unresolvedReviewComments(installationId, fullName, number);
  }

  commit(
    installationId: number,
    fullName: string,
    sha: string,
  ): Promise<GithubCommitDetail | null> {
    return this.#commits.commit(installationId, fullName, sha);
  }

  branches(
    installationId: number,
    fullName: string,
    defaultBranch: string,
  ): Promise<{ branches: GithubBranchSummary[]; truncated: boolean } | null> {
    return this.#commits.branches(installationId, fullName, defaultBranch);
  }

  userCanUse(userToken: string, installationId: number) {
    return this.#auth.userCanUse(userToken, installationId);
  }

  exchangeCode(code: string): Promise<GithubUserGrant | null> {
    return this.#auth.exchangeCode(code);
  }

  refreshGrant(refreshToken: string): Promise<GithubUserGrant | null> {
    return this.#auth.refreshGrant(refreshToken);
  }

  userProfile(userToken: string): Promise<GithubUserProfile> {
    return this.#auth.userProfile(userToken);
  }
}

export const github = new GithubClient(githubConfigFromEnv());
