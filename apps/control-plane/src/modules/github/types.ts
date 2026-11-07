import type { githubUrlsFromEnv } from "./app-manifest";
import type { GithubClient } from "./client";

export type GithubUrls = ReturnType<typeof githubUrlsFromEnv>;

export type GithubBranchSummary = {
  name: string;
  isDefault: boolean;
  protected: boolean;
  ahead: number;
  behind: number;
  lastCommit: { sha: string; message: string; author: string | null; date: string } | null;
  pull: { number: number; title: string } | null;
};

export type OpenPullPayload = {
  number: number;
  title: string;
  head: { ref: string; repo: { full_name: string } | null };
};

export type GithubConfig = {
  appId: string;
  privateKey: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  apiUrl: string;
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

export type GithubPullRequest = {
  number: number;
  url: string;
  title: string;
  branch: string;
  state: "open" | "closed" | "merged";
};

export type GithubUserGrant = {
  accessToken: string;
  expiresAt: number | null;
  refreshToken: string | null;
  refreshExpiresAt: number | null;
};

export type GithubUserProfile = { id: number; login: string; name: string | null };

export type GithubTreeEntry = { name: string; path: string; type: "file" | "directory" };

export type GithubReadme = { name: string; path: string; text: string; truncated: boolean };

export type GithubCommit = {
  sha: string;
  message: string;
  author: string | null;
  authorAvatar: string | null;
  date: string;
  parents: string[];
  refs: string[];
  tags: string[];
};

export type GithubCommitPage = { commits: GithubCommit[]; hasMore: boolean };

export type GithubCommitFilters = {
  author?: string;
  since?: string;
  until?: string;
  path?: string;
  branch?: string;
};

export type GithubTrackedKind = "pull" | "issue";

export type GithubTrackedState = "open" | "closed" | "merged" | "all";

export type GithubTrackedFilters = {
  author?: string;
  reviewRequested?: string;
  review?: "required" | "approved" | "changes_requested";
  checks?: "success" | "failure" | "pending";
  label?: string;
  draft?: boolean;
  staleDays?: number;
  text?: string;
  sort?: "updated" | "oldest" | "created" | "comments";
};

export type GithubTrackedItem = {
  number: number;
  title: string;
  url: string;
  author: string | null;
  status: "open" | "draft" | "merged" | "closed";
  comments: number;
  updatedAt: string;
  labels: string[];
};

export type GithubTrackedPage = { items: GithubTrackedItem[]; total: number; hasMore: boolean };

export type AppClient = { key: string; client: GithubClient };

export type GithubClients = {
  forKey(appKey: string): Promise<GithubClient>;
  forOrganization(organizationId: string): Promise<AppClient>;
  forget(organizationId: string): void;
};

export type GithubFileChange = {
  path: string;
  oldPath: string | null;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  patch: string | null;
};

export type GithubPullDetail = {
  number: number;
  title: string;
  body: string;
  url: string;
  status: "open" | "draft" | "merged" | "closed";
  author: string | null;
  base: string;
  head: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  comments: number;
  createdAt: string;
  updatedAt: string;
  mergeable: boolean | null;
  reviews: { login: string; state: "approved" | "changes_requested" | "commented" | "dismissed" }[];
  requestedReviewers: string[];
  checks: { state: "success" | "failure" | "pending" | "none"; runs: GithubCheckRun[] };
  files: GithubFileChange[];
  filesTruncated: boolean;
};

export type GithubCheckRun = {
  name: string;
  state: "success" | "failure" | "pending";
  url: string | null;
};

export type GithubCommitDetail = {
  sha: string;
  message: string;
  author: string | null;
  date: string;
  url: string;
  parents: string[];
  additions: number;
  deletions: number;
  files: GithubFileChange[];
  filesTruncated: boolean;
};

export type FilePayload = {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

export type ReviewPayload = {
  user: { login: string } | null;
  state: string;
  submitted_at?: string;
};

export type CheckRunPayload = {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
};

export type GithubIdentity = { id: number; login: string; name: string | null };

export type GithubUserToken = { token: string; identity: GithubIdentity };
