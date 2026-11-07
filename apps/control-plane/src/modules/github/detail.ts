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

export const TEXT_MAX_CHARS = 20_000;
export const PATCH_MAX_CHARS = 40_000;
export const FILES_LISTED = 100;

export type FilePayload = {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

const FILE_STATUSES = new Set([
  "added",
  "removed",
  "modified",
  "renamed",
  "copied",
  "changed",
  "unchanged",
]);

export function shapeFiles(files: FilePayload[]): GithubFileChange[] {
  return files.slice(0, FILES_LISTED).map((file) => ({
    path: file.filename,
    oldPath: file.previous_filename ?? null,
    status: FILE_STATUSES.has(file.status)
      ? (file.status as GithubFileChange["status"])
      : "modified",
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch === undefined ? null : file.patch.slice(0, PATCH_MAX_CHARS),
  }));
}

export type ReviewPayload = {
  user: { login: string } | null;
  state: string;
  submitted_at?: string;
};

export function latestReviews(reviews: ReviewPayload[]): GithubPullDetail["reviews"] {
  const latest = new Map<string, GithubPullDetail["reviews"][number]["state"]>();
  for (const review of reviews) {
    if (!review.user) continue;
    const state = review.state.toLowerCase();
    if (state !== "approved" && state !== "changes_requested" && state !== "dismissed") {
      if (!latest.has(review.user.login)) latest.set(review.user.login, "commented");
      continue;
    }
    latest.set(review.user.login, state);
  }
  return [...latest].map(([login, state]) => ({ login, state }));
}

export type CheckRunPayload = {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
};

const FAILED = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure"]);

function runState(run: CheckRunPayload): GithubCheckRun["state"] {
  if (run.status !== "completed") return "pending";
  return FAILED.has(run.conclusion ?? "") ? "failure" : "success";
}

export function checksOf(runs: CheckRunPayload[] | null): GithubPullDetail["checks"] {
  if (!runs || runs.length === 0) return { state: "none", runs: [] };
  const shaped = runs.map((run): GithubCheckRun => ({
    name: run.name,
    state: runState(run),
    url: run.html_url,
  }));
  let state: GithubCheckRun["state"] = "success";
  if (shaped.some((run) => run.state === "pending")) state = "pending";
  if (shaped.some((run) => run.state === "failure")) state = "failure";
  return { state, runs: shaped };
}
