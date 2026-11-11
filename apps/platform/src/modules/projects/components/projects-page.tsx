import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";

import { Button } from "@/components/button";
import { PageHeader } from "@/components/page-header";
import { authClient } from "@/lib/auth-client";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import { useThreads } from "@/modules/threads/hooks/use-threads";

import { anyFilterSet, filterProjects, filtersOf } from "../filters";
import { useProjectPalettes } from "../hooks/use-project-palettes";
import { useProjects } from "../hooks/use-projects";
import type { ProjectsSearch } from "../types";
import { AddFolderDialog } from "./add-folder-dialog";
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
  const change = (next: ProjectsSearch) =>
    void navigate({ to: "/projects", search: { ...search, ...next }, replace: true });

  let list = <ProjectList projects={shown} threads={threads} palettes={palettes} loaded={loaded} />;
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
        description="Open a project to see its files, README and threads. Each one is a folder on a computer that runs a runner, or an imported GitHub repository."
        actions={
          <span className="flex items-center gap-2">
            <AddFolderDialog />
            <ImportRepositoryDialog />
          </span>
        }
      />

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
        <section aria-label="Project list" className="flex min-h-0 flex-col gap-3">
          <ProjectFilterBar
            filters={filters}
            counts={counts}
            runtimes={runtimes}
            onChange={change}
          />
          {list}
        </section>

        <ProjectThreads threads={threads} projectCount={projects.length} />
      </div>
    </div>
  );
}
