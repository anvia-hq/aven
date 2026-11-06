import { X } from "@mynaui/icons-react";
import { Button } from "@/components/button";

import {
  activeQuickView,
  CHECKS,
  PULL_STATES,
  QUICK_VIEWS,
  REVIEWS,
  SORTS,
  type CenterFilters,
  type CenterSearch,
} from "../filters";
import { DebouncedInput } from "./debounced-input";
import { FilterSelect } from "./filter-select";

const STATE_LABELS: Record<CenterFilters["state"], string> = {
  open: "Open",
  draft: "Drafts",
  merged: "Merged",
  closed: "Closed",
  all: "Any state",
};
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

type Props = {
  filters: CenterFilters;
  /** Whether the person's GitHub account is connected: their own pull requests need it. */
  connected: boolean;
  onChange: (change: CenterSearch) => void;
  onQuickView: (id: (typeof QUICK_VIEWS)[number]["id"]) => void;
};

// The quick views, then the filters they are made of, and a search of titles. Everything is the
// address's search, so the bar only says what to change.
export function CenterFilterBar({ filters, connected, onChange, onQuickView }: Props) {
  const active = activeQuickView(filters);
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Quick views" className="flex flex-wrap gap-1.5">
        {QUICK_VIEWS.map((view) => {
          const own = "author" in view.filters || "reviewRequested" in view.filters;
          const disabled = own && !connected;
          return (
            <Button
              key={view.id}
              size="sm"
              variant={active?.id === view.id ? "secondary" : "outline"}
              aria-pressed={active?.id === view.id}
              disabled={disabled}
              title={disabled ? "Connect your GitHub account to use this view" : undefined}
              onClick={() => onQuickView(view.id)}
            >
              {view.label}
            </Button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DebouncedInput
          type="search"
          aria-label="Search titles"
          placeholder="Search titles"
          value={filters.text}
          onCommit={(text) => onChange({ text })}
          className="h-8 w-48"
        />
        <FilterSelect
          label="State"
          value={filters.state === "open" ? undefined : filters.state}
          options={options(
            PULL_STATES.filter((state) => state !== "open"),
            STATE_LABELS,
          )}
          onChange={(state) => onChange({ state })}
        />
        <FilterSelect
          label="Review"
          value={filters.review}
          options={options(REVIEWS, REVIEW_LABELS)}
          onChange={(review) => onChange({ review })}
        />
        <FilterSelect
          label="Checks"
          value={filters.checks}
          options={options(CHECKS, CHECK_LABELS)}
          onChange={(checks) => onChange({ checks })}
        />
        <FilterSelect
          label="Author"
          value={filters.author}
          options={[{ value: "me", label: "Mine" }]}
          onChange={(author) => onChange({ author })}
        />
        <FilterSelect
          label="Sort"
          value={filters.sort === "updated" ? undefined : filters.sort}
          options={options(
            SORTS.filter((sort) => sort !== "updated"),
            SORT_LABELS,
          )}
          onChange={(sort) => onChange({ sort })}
        />
        {filters.label && (
          <Button size="sm" variant="secondary" onClick={() => onChange({ label: undefined })}>
            Label: {filters.label}
            <X />
            <span className="sr-only">Remove the label filter</span>
          </Button>
        )}
        {filters.stale && (
          <Button size="sm" variant="secondary" onClick={() => onChange({ stale: undefined })}>
            Idle for {filters.stale}+ days
            <X />
            <span className="sr-only">Remove the idle filter</span>
          </Button>
        )}
      </div>
    </div>
  );
}
