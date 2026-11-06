import {
  CHECKS,
  PULL_STATES,
  REVIEWS,
  SORTS,
  type CenterFilters,
  type CenterSearch,
} from "../filters";
import type { Chip } from "./filter-chips";
import { Field, FilterPopover } from "./filter-popover";
import { FilterSelect } from "./filter-select";

const STATE_LABELS = {
  open: "Open",
  draft: "Drafts",
  merged: "Merged",
  closed: "Closed",
  all: "Any state",
} as const;
const REVIEW_LABELS = {
  required: "Review required",
  approved: "Approved",
  changes_requested: "Changes requested",
} as const;
const CHECK_LABELS = {
  success: "Checks passing",
  failure: "Checks failing",
  pending: "Checks pending",
} as const;
const SORT_LABELS = {
  updated: "Latest changed",
  oldest: "Least recently changed",
  created: "Newest",
  comments: "Most comments",
} as const;

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

/** What is narrowing the pull requests beyond "open, latest changed first", as chips that remove it. */
export function pullChips(filters: CenterFilters, change: (next: CenterSearch) => void): Chip[] {
  const chips: Chip[] = [];
  const add = (key: string, label: string, remove: CenterSearch) =>
    chips.push({ key, label, remove: () => change(remove) });
  if (filters.state !== "open") add("state", STATE_LABELS[filters.state], { state: undefined });
  if (filters.reviewRequested) add("rr", "Needs my review", { reviewRequested: undefined });
  if (filters.author) add("author", "Mine", { author: undefined });
  if (filters.review) add("review", REVIEW_LABELS[filters.review], { review: undefined });
  if (filters.checks) add("checks", CHECK_LABELS[filters.checks], { checks: undefined });
  if (filters.label) add("label", `Label: ${filters.label}`, { label: undefined });
  if (filters.stale) add("stale", `Idle ${filters.stale}+ days`, { stale: undefined });
  if (filters.sort !== "updated") add("sort", SORT_LABELS[filters.sort], { sort: undefined });
  return chips;
}

export const clearPulls: CenterSearch = {
  state: undefined,
  reviewRequested: undefined,
  author: undefined,
  review: undefined,
  checks: undefined,
  label: undefined,
  stale: undefined,
  sort: undefined,
  text: undefined,
};

// The pull requests' filters in one popover: state, review, checks, whose, and the order.
export function PullFilters({
  filters,
  count,
  onChange,
}: {
  filters: CenterFilters;
  count: number;
  onChange: (change: CenterSearch) => void;
}) {
  return (
    <FilterPopover label="Pull request filters" count={count}>
      <Field label="State">
        <FilterSelect
          label="State"
          anyLabel="Open"
          value={filters.state === "open" ? undefined : filters.state}
          options={options(
            PULL_STATES.filter((state) => state !== "open"),
            STATE_LABELS,
          )}
          onChange={(state) => onChange({ state })}
        />
      </Field>
      <Field label="Review">
        <FilterSelect
          label="Review"
          anyLabel="Any review"
          value={filters.review}
          options={options(REVIEWS, REVIEW_LABELS)}
          onChange={(review) => onChange({ review })}
        />
      </Field>
      <Field label="Checks">
        <FilterSelect
          label="Checks"
          anyLabel="Any checks"
          value={filters.checks}
          options={options(CHECKS, CHECK_LABELS)}
          onChange={(checks) => onChange({ checks })}
        />
      </Field>
      <Field label="Author">
        <FilterSelect
          label="Author"
          anyLabel="Anyone"
          value={filters.author}
          options={[{ value: "me", label: "Mine" }]}
          onChange={(author) => onChange({ author })}
        />
      </Field>
      <Field label="Order">
        <FilterSelect
          label="Order"
          anyLabel="Latest changed"
          value={filters.sort === "updated" ? undefined : filters.sort}
          options={options(
            SORTS.filter((sort) => sort !== "updated"),
            SORT_LABELS,
          )}
          onChange={(sort) => onChange({ sort })}
        />
      </Field>
    </FilterPopover>
  );
}
