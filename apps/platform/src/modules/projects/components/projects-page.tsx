import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { Button } from "@/components/button";
import { PageHeader } from "@/components/page-header";
import { authClient } from "@/lib/auth-client";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import { useThreads } from "@/modules/threads/hooks/use-threads";

import { anyFilterSet, filterProjects, filtersOf } from "../filters";
import { useProjectPalettes } from "../hooks/use-project-palettes";
import { useProjects } from "../hooks/use-projects";
import type { ProjectsSearch } from "../types";
import { ImportRepositoryDialog } from "./import-repository-dialog";
import { ProjectFilterBar } from "./project-filters";
import { ProjectListEmpty } from "./project-list-empty";
import { ProjectList } from "./project-list";
import { ProjectThreads } from "./project-threads";

export function ProjectsPage() {
  const search = useSearch({ from: "/_authed/_shell/projects/" });
  const navigate = useNavigate();
  const { projects, loaded } = useProjects();
  const { all: threads } = useThreads();
  const { data: session } = authClient.useSession();
  const { runtimes } = useRuntimes();
  const palettes = useProjectPalettes();

  const filters = filtersOf(search);
  const me = session?.user.id;
  const running = useMemo(
    () => new Set(threads.filter((thread) => thread.running).map((thread) => thread.projectId)),
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
  const shown = filterProjects(projects, filters, { me, running });
  const selected = projects.find((project) => project.id === search.project);
  const projectThreads = selected
    ? threads.filter((thread) => thread.projectId === selected.id)
    : threads;

  const change = (next: ProjectsSearch) =>
    void navigate({ to: "/projects", search: { ...search, ...next }, replace: true });

  const gone = loaded && search.project !== undefined && !selected;
  useEffect(() => {
    if (!gone) return;
    void navigate({ to: "/projects", search: { ...search, project: undefined }, replace: true });
  }, [gone, navigate, search]);

  let list = (
    <ProjectList
      projects={shown}
      threads={threads}
      palettes={palettes}
      selectedId={selected?.id}
      loaded={loaded}
      onSelect={(project) => change({ project })}
    />
  );
  if (loaded && projects.length === 0) {
    list = (
      <ProjectListEmpty>
        <p className="text-sm text-muted-foreground">
          Import a repository to start your first project, with the button above.
        </p>
      </ProjectListEmpty>
    );
  } else if (loaded && shown.length === 0) {
    list = (
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
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 p-4 lg:h-[calc(100svh-1rem-2px)]">
      <PageHeader
        title="Projects"
        description="Pick a project to see its threads. Each one is an imported GitHub repository and the runner that hosts its sandboxes."
        actions={<ImportRepositoryDialog />}
      />

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section aria-label="Project list" className="flex min-h-0 flex-col gap-3">
          <ProjectFilterBar
            filters={filters}
            counts={counts}
            runtimes={runtimes}
            onChange={change}
          />
          {list}
        </section>

        <ProjectThreads
          project={selected}
          threads={projectThreads}
          projectCount={projects.length}
          onShowAll={() => change({ project: undefined })}
        />
      </div>
    </div>
  );
}
