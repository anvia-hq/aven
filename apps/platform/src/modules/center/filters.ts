import type { CenterFilters, CenterSearch } from "./types";

export const PULL_STATES = ["open", "draft", "merged", "closed", "all"] as const;
export const REVIEWS = ["required", "approved", "changes_requested"] as const;
export const CHECKS = ["success", "failure", "pending"] as const;
export const SORTS = ["updated", "oldest", "created", "comments"] as const;

const oneOf = <T extends string>(options: readonly T[], value: unknown): T | undefined =>
  options.find((option) => option === value);
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

const day = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;

function opened(value: unknown, pattern: RegExp) {
  if (typeof value !== "string") return undefined;

  const [project, what, ...more] = value.split(":");
  return project && what && more.length === 0 && pattern.test(what) ? value : undefined;
}

export function parseCenterSearch(search: Record<string, unknown>): CenterSearch {
  const stale = Number(search.stale);
  return {
    project: text(search.project, 64),
    commitAuthor: text(search.commitAuthor, 100),
    since: day(search.since),
    until: day(search.until),
    path: text(search.path, 300),
    branch: text(search.branch, 200),
    grep: text(search.grep, 100),
    pr: opened(search.pr, /^\d{1,8}$/),
    commit: opened(search.commit, /^[0-9a-f]{7,40}$/),
    state: oneOf(PULL_STATES, search.state),
    author: search.author === "me" ? "me" : undefined,
    reviewRequested: search.reviewRequested === "me" ? "me" : undefined,
    review: oneOf(REVIEWS, search.review),
    checks: oneOf(CHECKS, search.checks),
    label: text(search.label, 50),
    text: text(search.text, 100),
    stale: Number.isInteger(stale) && stale >= 1 && stale <= 365 ? stale : undefined,
    sort: oneOf(SORTS, search.sort),
  };
}

export const filtersOf = (search: CenterSearch): CenterFilters => ({
  state: search.state ?? "open",
  author: search.author,
  reviewRequested: search.reviewRequested,
  review: search.review,
  checks: search.checks,
  label: search.label,
  text: search.text,
  stale: search.stale,
  sort: search.sort ?? "updated",
});

export const QUICK_VIEWS = [
  { id: "all", label: "All open", filters: {} },
  { id: "review", label: "Needs my review", filters: { reviewRequested: "me" } },
  { id: "mine", label: "Mine", filters: { author: "me" } },
  { id: "failing", label: "Failing checks", filters: { checks: "failure" } },
  { id: "ready", label: "Ready to merge", filters: { review: "approved", checks: "success" } },
  { id: "stale", label: "Stale", filters: { stale: 7 } },
] as const satisfies { id: string; label: string; filters: Partial<CenterFilters> }[];

const FILTER_KEYS = [
  "author",
  "reviewRequested",
  "review",
  "checks",
  "label",
  "text",
  "stale",
] as const;

export function quickViewSearch(
  view: (typeof QUICK_VIEWS)[number],
  project: string | undefined,
): CenterSearch {
  const search: CenterSearch = { project };
  for (const key of FILTER_KEYS) (search as Record<string, unknown>)[key] = undefined;
  return { ...search, ...view.filters, state: undefined, sort: undefined };
}

export function activeQuickView(filters: CenterFilters) {
  return QUICK_VIEWS.find(
    (view) =>
      filters.state === "open" &&
      filters.sort === "updated" &&
      FILTER_KEYS.every((key) => filters[key] === (view.filters as Partial<CenterFilters>)[key]),
  );
}

export function pullsQuery(filters: CenterFilters, login: string | null): string | null {
  const needsLogin = filters.author === "me" || filters.reviewRequested === "me";

  if (needsLogin && !login) return null;

  const query = new URLSearchParams({
    state: filters.state === "draft" ? "open" : filters.state,
    page: "1",
    sort: filters.sort,
  });

  if (filters.state === "draft") query.set("draft", "true");

  if (filters.author && login) query.set("author", login);

  if (filters.reviewRequested && login) query.set("reviewRequested", login);

  if (filters.review) query.set("review", filters.review);

  if (filters.checks) query.set("checks", filters.checks);

  if (filters.label) query.set("label", filters.label);

  if (filters.text) query.set("text", filters.text);

  if (filters.stale) query.set("staleDays", String(filters.stale));

  return query.toString();
}

export function commitFilterQuery(search: CenterSearch, one: boolean) {
  const query = new URLSearchParams();

  if (search.commitAuthor) query.set("author", search.commitAuthor);

  if (search.since) query.set("since", search.since);

  if (search.until) query.set("until", search.until);

  if (one && search.path) query.set("path", search.path);

  if (one && search.branch) query.set("branch", search.branch);

  return query.toString();
}
