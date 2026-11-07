export type Project = {
  id: string;
  name: string;
  repoFullName: string;
  defaultBranch: string;
  runtimeId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ImportStage =
  | { kind: "failed"; message: string }
  | { kind: "not-configured" }
  | { kind: "connect" }
  | { kind: "no-runner" }
  | { kind: "ready" };

export type GithubStatus = {
  configured: boolean;
  installUrl: string | null;
  canSetUp: boolean;
  appKey: string;
  own: boolean;
  canSetUpWorkspace: boolean;
};

export type GithubAccount = { connected: boolean; login: string | null; appKey: string };

export type GithubInstallation = {
  id: string;
  accountLogin: string;
};

export type GithubRepo = {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
};

export type RepoEntry = { name: string; path: string; type: "file" | "directory" };

export type RepoReadme = { name: string; path: string; text: string; truncated: boolean };

export type RepoCommit = {
  sha: string;
  message: string;
  author: string | null;
  authorAvatar: string | null;
  date: string;
  parents: string[];
  refs: string[];
  tags: string[];
};

export type RepoCommitPage = { commits: RepoCommit[]; hasMore: boolean };

export type TrackedKind = "pull" | "issue";
export type TrackedState = "open" | "closed" | "merged" | "all";

export type TrackedItem = {
  number: number;
  title: string;
  url: string;
  author: string | null;
  status: "open" | "draft" | "merged" | "closed";
  comments: number;
  updatedAt: string;
  labels: string[];
};

export type TrackedPage = { items: TrackedItem[]; total: number; hasMore: boolean };
