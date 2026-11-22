import type {
  GitActionPayload,
  GitBranchInfo,
  GitCommitEntry,
  GitConflictState,
  GitReflogEntry,
  GitRemoteRef,
  GitStashInfo,
  GitTagInfo,
  GitWipSummary,
  GitWorktreeInfo,
  GitWorkspaceStatusFile,
  GraphRow,
} from "@aven/protocol/types";

export type GitPullCheckRun = {
  id?: number;
  name: string;
  state: "success" | "failure" | "pending";
  url: string | null;
  summary?: string | null;
};

export type GitPullFileChange = {
  path: string;
  oldPath: string | null;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  patch: string | null;
};

export type GitPullListEntry = {
  number: number;
  title: string;
  url: string;
  author: string | null;
  status: "open" | "draft" | "merged" | "closed";
  head: string;
  headSha: string;
  base: string;
  updatedAt: string;
};

export type GitPullDetail = {
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
  checks: { state: "success" | "failure" | "pending" | "none"; runs: GitPullCheckRun[] };
  files: GitPullFileChange[];
  filesTruncated: boolean;
};

export type GitReviewComment = {
  author: string | null;
  path: string;
  text: string;
  outdated: boolean;
};

export type GitCheckLogResult = {
  checkRunId: number;
  name: string;
  summary: string | null;
  text: string | null;
  logs: string | null;
  url: string | null;
};

export type GitCenterMode = "live" | "readonly";

export type GitCenterModeReason =
  | "ok"
  | "runner_offline"
  | "runner_outdated"
  | "github_only"
  | "not_a_repo";

export type GitThreadPullRef = {
  number: number;
  url: string;
  branch: string;
  title: string;
  state: "open" | "closed" | "merged";
};

export type GitCenterThreadOverlay = {
  id: string;
  title: string;
  branch: string | null;
  headSha: string | null;
  running: boolean;
  canMutate: boolean;
  wip: GitWipSummary;
  conflicts: GitConflictState | null;
  pullRequests: GitThreadPullRef[];
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
  pulls: GitPullListEntry[];
};

export type GitCenterTarget = { kind: "project" } | { kind: "thread"; threadId: string };

export type GitCenterInspector =
  | { kind: "wip" }
  | { kind: "commit"; sha: string }
  | { kind: "pr"; number: number };

export type GitCenterFilters = {
  search: string;
  branch: string | null;
  author: string;
  path: string;
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

export type GitCenterCommitDetail = {
  sha: string;
  message: string;
  body: string;
  author: string | null;
  authorEmail: string | null;
  date: string;
  parents: string[];
  patch: string;
  truncated: boolean;
  additions: number;
  deletions: number;
  filesChanged: number;
  url?: string;
};

export type GitCenterReflogResponse = {
  entries: GitReflogEntry[];
};

export type GitCenterPullDetailResponse = {
  pull: GitPullDetail;
  unresolvedComments: GitReviewComment[];
  githubConnected: boolean;
};

export type GitCenterCheckLogResponse = GitCheckLogResult & {
  scopeRequired?: boolean;
};

export type GitCenterActionResult = {
  ok: boolean;
  summary: string;
  conflicts?: GitConflictState | null;
  output?: string;
};

export type GitCenterHandoffInput =
  | { kind: "start_from_ref"; ref: string; prompt?: string }
  | {
      kind: "resolve_conflicts";
      threadId?: string;
      operation: "merge" | "rebase" | "cherry-pick" | "revert";
      files: string[];
    }
  | {
      kind: "fix_ci";
      pullNumber: number;
      branch: string;
      checkName: string;
      logSnippet?: string;
    };

export type GitCenterHandoffResult = {
  threadId: string;
  created: boolean;
};

export type GraphDisplayRow =
  | {
      kind: "wip";
      id: string;
      target: GitCenterTarget;
      label: string;
      branch: string | null;
      wip: GitWipSummary;
      conflicts: GitConflictState | null;
      running: boolean;
      graph: GraphRow;
    }
  | {
      kind: "commit";
      id: string;
      commit: GitCommitEntry;
      isHead: boolean;
      threads: GitCenterThreadOverlay[];
      pulls: GitPullListEntry[];
      graph: GraphRow;
    };

export type GitHygieneSummary = {
  mergedBranches: GitBranchInfo[];
  goneBranches: GitBranchInfo[];
  removableWorktrees: GitWorktreeInfo[];
  totalCount: number;
};

export type GitConfirmRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  action: GitActionPayload;
  target: GitCenterTarget;
};
