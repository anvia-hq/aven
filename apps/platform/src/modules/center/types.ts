// What `GET /projects/:id/pulls/:number` and `/commits/:sha` answer (decision 0132).
export type FileChange = {
  path: string;
  oldPath: string | null;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  patch: string | null;
};

export type CheckRun = {
  name: string;
  state: "success" | "failure" | "pending";
  url: string | null;
};

export type PullDetail = {
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
  checks: { state: "success" | "failure" | "pending" | "none"; runs: CheckRun[] };
  files: FileChange[];
  filesTruncated: boolean;
};

export type CommitDetail = {
  sha: string;
  message: string;
  author: string | null;
  date: string;
  url: string;
  parents: string[];
  additions: number;
  deletions: number;
  files: FileChange[];
  filesTruncated: boolean;
};

/** What `GET /projects/:id/branches` answers: where each branch stands against the default one. */
export type BranchSummary = {
  name: string;
  isDefault: boolean;
  protected: boolean;
  ahead: number;
  behind: number;
  lastCommit: { sha: string; message: string; author: string | null; date: string } | null;
  pull: { number: number; title: string } | null;
};

export type BranchList = { branches: BranchSummary[]; truncated: boolean };
