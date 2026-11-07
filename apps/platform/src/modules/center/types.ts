import type { CHECKS, PULL_STATES, REVIEWS, SORTS } from "./filters";
import type { Project, RepoCommit, TrackedItem } from "@/modules/projects/types";

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

export type PullsView = "pulls" | "branches";

export type Chip = { key: string; label: string; remove: () => void };

export type DayGroup = { key: string; label: string; entries: CommitEntry[] };

export type PullState = (typeof PULL_STATES)[number];

export type CenterFilters = {
  state: PullState;
  author?: "me";
  reviewRequested?: "me";
  review?: (typeof REVIEWS)[number];
  checks?: (typeof CHECKS)[number];
  label?: string;
  text?: string;
  stale?: number;
  sort: (typeof SORTS)[number];
};

export type CenterSearch = Partial<Omit<CenterFilters, "state" | "sort">> & {
  project?: string;
  commitAuthor?: string;
  since?: string;
  until?: string;
  path?: string;
  branch?: string;
  grep?: string;
  pr?: string;
  commit?: string;
  state?: PullState;
  sort?: CenterFilters["sort"];
};

export type PullEntry = { project: Project; item: TrackedItem };

export type CommitEntry = { project: Project; commit: RepoCommit };
