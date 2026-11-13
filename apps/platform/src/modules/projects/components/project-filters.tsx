import { Search } from "@mynaui/icons-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Input } from "@aven/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@aven/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@aven/ui/tabs";
import type { Runtime } from "@/modules/runtimes/types";

import { PROJECT_VIEWS } from "../filters";
import type { ProjectFilters, ProjectsSearch, ProjectsView } from "../types";

const ANY_RUNNER = "__any__";

type Props = {
  filters: ProjectFilters;
  counts: Record<ProjectsView, number>;
  runtimes: Runtime[];
  onChange: (next: ProjectsSearch) => void;
  children?: ReactNode;
};

const SEARCH_WAIT_MS = 250;

function SearchField({
  query,
  onCommit,
}: {
  query: string | undefined;
  onCommit: (q?: string) => void;
}) {
  const [text, setText] = useState(query ?? "");
  const sent = useRef(query);
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => {
    if (query === sent.current) return;

    sent.current = query;
    setText(query ?? "");
  }, [query]);
  useEffect(() => {
    if (text === (sent.current ?? "")) return;

    const timer = setTimeout(() => {
      sent.current = text || undefined;
      commit.current(text || undefined);
    }, SEARCH_WAIT_MS);
    return () => clearTimeout(timer);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label="Search projects"
        placeholder="Search projects"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          sent.current = text || undefined;
          commit.current(text || undefined);
        }}
        className="h-8 pl-8"
      />
    </div>
  );
}

export function ProjectFilterBar({ filters, counts, runtimes, onChange, children }: Props) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <div className="w-full sm:w-64">
        <SearchField query={filters.query} onCommit={(q) => onChange({ q })} />
      </div>
      <div className="flex flex-1 items-center gap-2">
        <Tabs
          value={filters.view}
          onValueChange={(view) =>
            onChange({ view: view === "all" ? undefined : (view as ProjectsView) })
          }
          className="shrink-0"
        >
          <TabsList aria-label="Project filters" className="h-8">
            {PROJECT_VIEWS.map((view) => (
              <TabsTrigger key={view.id} value={view.id} className="gap-1 px-2.5 text-xs">
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
        {children && <div className="ml-auto flex shrink-0 items-center">{children}</div>}
      </div>
    </div>
  );
}
