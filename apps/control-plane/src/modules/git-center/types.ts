import type {
  GitBranchInfo,
  GitCommitDiffResult,
  GitCommitEntry,
  GitConflictState,
  GitReflogEntry,
  GitRemoteRef,
  GitStashInfo,
  GitTagInfo,
  GitWipSummary,
  GitWorktreeInfo,
  GitWorkspaceStatusFile,
} from "@aven/protocol/types";
import type {
  GithubCheckLogResult,
  GithubPullDetail,
  GithubPullListEntry,
  GithubReviewComment,
} from "@aven/github/types";
import type { ThreadPullRequest } from "../threads/types";

export type GitCenterMode = "live" | "readonly";

export type GitCenterModeReason =
  | "ok"
  | "runner_offline"
  | "runner_outdated"
  | "github_only"
  | "not_a_repo";

export type GitCenterThreadOverlay = {
  id: string;
  title: string;
  branch: string | null;
  headSha: string | null;
  running: boolean;
  canMutate: boolean;
  wip: GitWipSummary;
  conflicts: GitConflictState | null;
  pullRequests: ThreadPullRequest[];
  updatedAt: string;
};

export type GitCenterSnapshot = {
  project: {
    id: string;
    name: string;
    repoFullName: string | null;
    directory: string | null;
    runtimeId: string | null;
    defaultBranch: string | null;
  };
  mode: GitCenterMode;
  modeReason: GitCenterModeReason;
  githubConnected: boolean;
  headBranch: string | null;
  headSha: string | null;
  detached: boolean;
  defaultBranch: string | null;
  branches: GitBranchInfo[];
  remotes: GitRemoteRef[];
  tags: GitTagInfo[];
  stashes: GitStashInfo[];
  worktrees: GitWorktreeInfo[];
  conflicts: GitConflictState | null;
  wip: GitWipSummary;
  commits: GitCommitEntry[];
  hasMore: boolean;
  threads: GitCenterThreadOverlay[];
  pulls: GithubPullListEntry[];
};

export type GitCenterWorkspaceResponse = {
  target: { kind: "project" } | { kind: "thread"; threadId: string; title: string };
  running: boolean;
  canMutate: boolean;
  branch: string | null;
  headSha: string | null;
  detached: boolean;
  conflicts: GitConflictState | null;
  files: GitWorkspaceStatusFile[];
  patch: string;
  truncated: boolean;
  wip: GitWipSummary;
};

export type GitCenterCommitDetail = GitCommitDiffResult & {
  url?: string;
};

export type GitCenterReflogResponse = {
  entries: GitReflogEntry[];
};

export type GitCenterPullDetailResponse = {
  pull: GithubPullDetail;
  unresolvedComments: GithubReviewComment[];
  githubConnected: boolean;
};

export type GitCenterCheckLogResponse = GithubCheckLogResult & {
  scopeRequired?: boolean;
};

export type GitCenterHandoffResult = {
  threadId: string;
  created: boolean;
};
