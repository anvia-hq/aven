import type {
  CheckRunPayload,
  FilePayload,
  GithubCheckRun,
  GithubFileChange,
  GithubPullDetail,
  ReviewPayload,
} from "./types";

export const TEXT_MAX_CHARS = 20_000;
export const PATCH_MAX_CHARS = 40_000;
export const FILES_LISTED = 100;

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
