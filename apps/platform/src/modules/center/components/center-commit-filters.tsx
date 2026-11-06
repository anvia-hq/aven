import { Button } from "@/components/button";

import type { CenterSearch } from "../filters";
import type { BranchSummary } from "../types";
import { DebouncedInput } from "./debounced-input";
import { FilterSelect } from "./filter-select";

type Props = {
  search: CenterSearch;
  /** Given for one project: its branches to read the history of, and a file to read it for. */
  branches?: BranchSummary[];
  onChange: (change: CenterSearch) => void;
};

const FIELD = "h-8 w-36";

// What narrows the commits: who wrote them, when, the words of their message and, for one project,
// the file they touch and the branch they are read from. All of it is the address's search.
export function CenterCommitFilters({ search, branches, onChange }: Props) {
  const any = [
    search.commitAuthor,
    search.since,
    search.until,
    search.path,
    search.branch,
    search.grep,
  ].some(Boolean);
  return (
    <div role="group" aria-label="Commit filters" className="flex flex-wrap items-center gap-2">
      <DebouncedInput
        type="search"
        aria-label="Search commit messages"
        placeholder="Search messages"
        value={search.grep}
        onCommit={(grep) => onChange({ grep })}
        className={FIELD}
      />
      <DebouncedInput
        type="search"
        aria-label="Commit author"
        placeholder="Author"
        value={search.commitAuthor}
        onCommit={(commitAuthor) => onChange({ commitAuthor })}
        className="h-8 w-28"
      />
      <DebouncedInput
        type="date"
        aria-label="Commits since"
        value={search.since}
        onCommit={(since) => onChange({ since })}
        className="h-8 w-36"
      />
      <DebouncedInput
        type="date"
        aria-label="Commits until"
        value={search.until}
        onCommit={(until) => onChange({ until })}
        className="h-8 w-36"
      />
      {branches && (
        <>
          <DebouncedInput
            type="search"
            aria-label="Commits touching a file"
            placeholder="File path"
            value={search.path}
            onCommit={(path) => onChange({ path })}
            className={FIELD}
          />
          <FilterSelect
            label="Branch"
            value={search.branch}
            options={branches
              .filter((branch) => !branch.isDefault)
              .map((branch) => ({ value: branch.name, label: branch.name }))}
            onChange={(branch) => onChange({ branch })}
          />
        </>
      )}
      {any && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              commitAuthor: undefined,
              since: undefined,
              until: undefined,
              path: undefined,
              branch: undefined,
              grep: undefined,
            })
          }
        >
          Clear
        </Button>
      )}
    </div>
  );
}
