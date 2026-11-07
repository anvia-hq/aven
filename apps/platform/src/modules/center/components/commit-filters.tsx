import type { BranchSummary, CenterSearch, Chip } from "../types";
import { DebouncedInput } from "./debounced-input";
import { Field, FilterPopover } from "./filter-popover";
import { FilterSelect } from "./filter-select";

const DAY = 86_400_000;
const dayOf = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const PERIODS = [
  { value: "today", label: "Today", days: 0 },
  { value: "week", label: "Last 7 days", days: 7 },
  { value: "month", label: "Last 30 days", days: 30 },
] as const;

const periodSince = (days: number, now = Date.now()) => dayOf(now - days * DAY);
const periodOf = (since: string | undefined, now = Date.now()) =>
  PERIODS.find((period) => periodSince(period.days, now) === since);

export function periodLabel(search: CenterSearch, now = Date.now()) {
  if (!search.since && !search.until) return undefined;
  const preset = !search.until ? periodOf(search.since, now) : undefined;
  if (preset) return preset.label;
  return `${search.since ?? "…"} → ${search.until ?? "now"}`;
}

export const clearCommits: CenterSearch = {
  commitAuthor: undefined,
  since: undefined,
  until: undefined,
  path: undefined,
  branch: undefined,
  grep: undefined,
};

export function commitChips(search: CenterSearch, change: (next: CenterSearch) => void): Chip[] {
  const chips: Chip[] = [];
  const add = (key: string, label: string, remove: CenterSearch) =>
    chips.push({ key, label, remove: () => change(remove) });
  if (search.grep) add("grep", `“${search.grep}”`, { grep: undefined });
  if (search.commitAuthor) add("author", `By ${search.commitAuthor}`, { commitAuthor: undefined });
  const period = periodLabel(search);
  if (period) add("period", period, { since: undefined, until: undefined });
  if (search.path) add("path", `File: ${search.path}`, { path: undefined });
  if (search.branch) add("branch", `Branch: ${search.branch}`, { branch: undefined });
  return chips;
}

export function CommitSearch({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (grep: string | undefined) => void;
}) {
  return (
    <DebouncedInput
      type="search"
      aria-label="Search commit messages"
      placeholder="Search messages"
      value={value}
      onCommit={onChange}
      className="h-8 w-40"
    />
  );
}

export function CommitFilters({
  search,
  branches,
  count,
  onChange,
}: {
  search: CenterSearch;
  branches?: BranchSummary[];
  count: number;
  onChange: (change: CenterSearch) => void;
}) {
  const preset = !search.until ? periodOf(search.since) : undefined;
  const custom =
    (search.since || search.until) && !preset
      ? [{ value: "custom", label: periodLabel(search)! }]
      : [];
  return (
    <FilterPopover label="Commit filters" count={count}>
      <Field label="Author">
        <DebouncedInput
          type="search"
          aria-label="Commit author"
          placeholder="Anyone"
          value={search.commitAuthor}
          onCommit={(commitAuthor) => onChange({ commitAuthor })}
          className="h-8"
        />
      </Field>
      <Field label="When">
        <FilterSelect
          label="Period"
          anyLabel="Any time"
          value={preset?.value ?? (custom.length > 0 ? "custom" : undefined)}
          options={[
            ...PERIODS.map(({ value, label }) => ({ value: value as string, label })),
            ...custom,
          ]}
          onChange={(value) => {
            const chosen = PERIODS.find((period) => period.value === value);
            if (value === "custom") return;
            onChange({ since: chosen ? periodSince(chosen.days) : undefined, until: undefined });
          }}
        />
      </Field>
      {branches && (
        <>
          <Field label="Branch">
            <FilterSelect
              label="Branch"
              anyLabel="Default branch"
              value={search.branch}
              options={branches
                .filter((branch) => !branch.isDefault)
                .map((branch) => ({ value: branch.name, label: branch.name }))}
              onChange={(branch) => onChange({ branch })}
            />
          </Field>
          <Field label="File">
            <DebouncedInput
              type="search"
              aria-label="Commits touching a file"
              placeholder="src/login.ts"
              value={search.path}
              onCommit={(path) => onChange({ path })}
              className="h-8"
            />
          </Field>
        </>
      )}
    </FilterPopover>
  );
}
