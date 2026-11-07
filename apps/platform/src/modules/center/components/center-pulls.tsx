import { GitPullRequest } from "@mynaui/icons-react";
import type { ReactNode } from "react";

import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { TrackedRow } from "@/modules/projects/components/repo-tracked";
import type { Project } from "@/modules/projects/types";

import type { CenterFilters, CenterSearch } from "../filters";
import type { PullEntry } from "../hooks/use-center-feed";
import { DebouncedInput } from "./debounced-input";
import { FilterChips } from "./filter-chips";
import { clearPulls, PullFilters, pullChips } from "./pull-filters";

export type PullsView = "pulls" | "branches";

type Props = {
  pulls: PullEntry[] | undefined;
  loading: boolean;
  filters: CenterFilters;
  onChange: (change: CenterSearch) => void;
  onOpen: (project: Project, number: number) => void;
  branches?: { count: string; panel: ReactNode };
  view: PullsView;
  onView: (view: PullsView) => void;
};

export function CenterPulls({
  pulls,
  loading,
  filters,
  onChange,
  onOpen,
  branches,
  view,
  onView,
}: Props) {
  const chips = pullChips(filters, onChange);
  const showing = branches ? view : "pulls";
  const shown = filters.text
    ? [
        ...chips,
        { key: "text", label: `“${filters.text}”`, remove: () => onChange({ text: undefined }) },
      ]
    : chips;
  return (
    <SectionCard
      label="Pull requests"
      title={
        branches ? (
          <Tabs value={view} onValueChange={(next) => onView(next as PullsView)}>
            <TabsList variant="line" aria-label="Show">
              <TabsTrigger value="pulls">
                Pull requests
                {pulls && <span className="text-xs text-muted-foreground">{pulls.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="branches">
                Branches
                <span className="text-xs text-muted-foreground">{branches.count}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : (
          <>
            <GitPullRequest className="size-4 text-muted-foreground" />
            Pull requests
            {pulls && (
              <span className="text-xs font-normal text-muted-foreground">{pulls.length}</span>
            )}
          </>
        )
      }
      actions={
        showing === "pulls" && (
          <>
            <DebouncedInput
              type="search"
              aria-label="Search titles"
              placeholder="Search titles"
              value={filters.text}
              onCommit={(text) => onChange({ text })}
              className="h-8 w-40"
            />
            <PullFilters filters={filters} count={chips.length} onChange={onChange} />
          </>
        )
      }
    >
      {showing === "branches" && branches?.panel}
      {showing === "pulls" && (
        <>
          <FilterChips
            name="Active pull request filters"
            chips={shown}
            onClear={() => onChange(clearPulls)}
          />
          {loading && (
            <div className="flex flex-col gap-3 p-4" aria-busy>
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          )}
          {pulls && (
            <ul className="flex flex-col lg:max-h-[calc(100svh-15rem)] lg:overflow-y-auto">
              {pulls.map(({ project, item }) => (
                <TrackedRow
                  key={`${project.id}:${item.number}`}
                  item={item}
                  kind="pull"
                  project={project}
                  onLabel={(label) => onChange({ label })}
                  onOpen={() => onOpen(project, item.number)}
                />
              ))}
              {pulls.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted-foreground">
                  No pull requests match these filters.
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </SectionCard>
  );
}
