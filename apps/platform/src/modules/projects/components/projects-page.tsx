import { Plus } from "@mynaui/icons-react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Button, buttonVariants } from "@aven/ui/button";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@aven/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@aven/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import { useThreads } from "@/modules/threads/hooks/use-threads";

import { projectActivity } from "../activity";
import { anyFilterSet, filterProjects, filtersOf } from "../filters";
import { useProjectPalettes } from "../hooks/use-project-palettes";
import { useProjects } from "../hooks/use-projects";
import type { ProjectsSearch, ThreadShelf } from "../types";
import { AddProjectDialog } from "./add-project-dialog";
import { ProjectFilterBar } from "./project-filters";
import { ProjectListEmpty } from "./project-list-empty";
import { ProjectsBoard } from "./projects-board";

const ARCHIVED_SHOWN = 50;

export function ProjectsPage() {
  const search = useSearch({ from: "/_authed/_shell/projects/" });
  const navigate = useNavigate();
  const { projects, loaded } = useProjects();
  const { all: threads } = useThreads();
  const { data: session } = authClient.useSession();
  const { runtimes } = useRuntimes();
  const palettes = useProjectPalettes();
  const [shelf, setShelf] = useState<ThreadShelf>("open");

  const filters = filtersOf(search);
  const me = session?.user.id;
  const running = useMemo(
    () => new Set(threads.flatMap((thread) => (thread.running ? [thread.projectId] : []))),
    [threads],
  );
  const counts = useMemo(
    () => ({
      all: projects.length,
      mine: filterProjects(projects, { view: "mine" }, { me, running }).length,
      working: filterProjects(projects, { view: "working" }, { me, running }).length,
    }),
    [projects, me, running],
  );
  const archived = threads.filter((thread) => thread.state === "archived").length;
  const shown = filterProjects(projects, filters, { me, running });
  const entries = projectActivity(shown, threads, shelf).filter(
    (entry) => shelf === "open" || entry.threads.length > 0,
  );
  const change = (next: ProjectsSearch) =>
    void navigate({ to: "/projects", search: { ...search, ...next }, replace: true });

  let board = (
    <ProjectsBoard
      entries={entries}
      palettes={palettes}
      limit={shelf === "archived" ? ARCHIVED_SHOWN : undefined}
    />
  );

  if (!loaded) {
    board = (
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((card) => (
          <Skeleton key={card} className="h-36 w-full" />
        ))}
      </div>
    );
  } else if (projects.length === 0) {
    board = (
      <ProjectListEmpty>
        <p className="text-sm text-muted-foreground">
          Add a project to start, with the button above.
        </p>
      </ProjectListEmpty>
    );
  } else if (shown.length === 0) {
    board = (
      <ProjectListEmpty>
        <p className="text-sm text-muted-foreground">No projects match these filters.</p>
        {anyFilterSet(filters) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => change({ q: undefined, view: undefined, runner: undefined })}
          >
            Clear filters
          </Button>
        )}
      </ProjectListEmpty>
    );
  } else if (entries.length === 0) {
    board = (
      <ProjectListEmpty>
        <p className="text-sm text-muted-foreground">No archived threads.</p>
      </ProjectListEmpty>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 p-4 lg:h-[calc(100svh-1rem-2px)]">
      <PageHeader
        title="Projects"
        description="Each project with its threads. Open one to see its files, README and commits."
        actions={
          <>
            <Link to="/threads" className={buttonVariants({ variant: "outline" })}>
              <Plus />
              New thread
            </Link>
            <AddProjectDialog />
          </>
        }
      />

      <section aria-label="Project list" className="flex min-h-0 flex-1 flex-col gap-3">
        <ProjectFilterBar filters={filters} counts={counts} runtimes={runtimes} onChange={change}>
          <Tabs value={shelf} onValueChange={(next) => setShelf(next as ThreadShelf)}>
            <TabsList aria-label="Thread state" className="h-8">
              <TabsTrigger value="open" className="gap-1 px-2.5 text-xs">
                Open
                <span className="text-xs text-muted-foreground tabular-nums">
                  {threads.length - archived}
                </span>
              </TabsTrigger>
              <TabsTrigger value="archived" className="gap-1 px-2.5 text-xs">
                Archived
                <span className="text-xs text-muted-foreground tabular-nums">{archived}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </ProjectFilterBar>
        {board}
      </section>
    </div>
  );
}
