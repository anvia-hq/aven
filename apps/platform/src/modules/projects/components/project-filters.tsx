import { Search } from "@mynaui/icons-react";

import { Input } from "@/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import type { Runtime } from "@/modules/runtimes/types";

import { PROJECT_VIEWS } from "../filters";
import type { ProjectFilters, ProjectsSearch, ProjectsView } from "../types";

const ANY_RUNNER = "__any__";

type Props = {
  filters: ProjectFilters;
  counts: Record<ProjectsView, number>;
  runtimes: Runtime[];
  onChange: (next: ProjectsSearch) => void;
};

export function ProjectFilterBar({ filters, counts, runtimes, onChange }: Props) {
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Search projects"
          placeholder="Search projects"
          value={filters.query ?? ""}
          onChange={(event) => onChange({ q: event.target.value || undefined })}
          className="h-8 pl-8"
        />
      </div>
      <div className="flex items-center gap-2">
        <Tabs
          value={filters.view}
          onValueChange={(view) =>
            onChange({ view: view === "all" ? undefined : (view as ProjectsView) })
          }
          className="min-w-0 flex-1"
        >
          <TabsList aria-label="Project filters" className="h-7 w-full">
            {PROJECT_VIEWS.map((view) => (
              <TabsTrigger key={view.id} value={view.id} className="gap-1 px-1 text-xs">
                {view.label}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {counts[view.id]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {runtimes.length > 1 && (
          <Select
            items={[
              { value: ANY_RUNNER, label: "All runners" },
              ...runtimes.map((runtime) => ({ value: runtime.id, label: runtime.name })),
            ]}
            value={filters.runnerId ?? ANY_RUNNER}
            onValueChange={(runner) =>
              onChange({ runner: runner && runner !== ANY_RUNNER ? runner : undefined })
            }
          >
            <SelectTrigger
              size="sm"
              aria-label="Runner"
              className={filters.runnerId ? "max-w-32" : "max-w-32 text-muted-foreground"}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="end">
              <SelectItem value={ANY_RUNNER}>All runners</SelectItem>
              {runtimes.map((runtime) => (
                <SelectItem key={runtime.id} value={runtime.id}>
                  {runtime.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
