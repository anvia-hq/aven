import { Plus } from "@mynaui/icons-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/button";
import { NotFound } from "@/components/not-found";
import { SectionCard } from "@/components/section-card";
import { ProjectAbout } from "@/modules/projects/components/project-about";
import { ProjectHeader } from "@/modules/projects/components/project-header";
import { ProjectTitle } from "@/modules/projects/components/project-title";
import { RepoCommits } from "@/modules/projects/components/repo-commits";
import { RepoFiles } from "@/modules/projects/components/repo-files";
import { RepoReadme } from "@/modules/projects/components/repo-readme";
import { RepoTracked } from "@/modules/projects/components/repo-tracked";
import { useProject } from "@/modules/projects/hooks/use-project";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import { InheritedVariables } from "@/modules/variables/components/inherited-variables";
import { VariablesSection } from "@/modules/variables/components/variables-section";

export const Route = createFileRoute("/_authed/_shell/projects/$projectId")({
  validateSearch: (search: Record<string, unknown>): { path?: string } => ({
    path: typeof search.path === "string" && search.path !== "" ? search.path : undefined,
  }),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { path = "" } = Route.useSearch();
  const navigate = useNavigate();
  const { project, loaded } = useProject(projectId);
  const threads = useThreads().all.filter((thread) => thread.projectId === projectId);

  if (!project) {
    if (!loaded) return null;
    return <NotFound as="main" title="Project not found" to="/projects" back="Back to projects" />;
  }

  return (
    <div className="flex w-full min-w-0 flex-col">
      <ProjectHeader project={project} />

      <main className="flex w-full flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <ProjectTitle project={project} />
          <Button
            className="shrink-0"
            onClick={() => navigate({ to: "/threads", search: { project: project.id } })}
          >
            <Plus />
            Start thread
          </Button>
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <RepoFiles project={project} path={path} />
            {path === "" && <RepoReadme project={project} />}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <ProjectAbout project={project} />
            <SectionCard title="Recent threads">
              <div className="p-1">
                <ThreadList threads={threads} empty="No threads in this project yet." />
              </div>
            </SectionCard>
            <VariablesSection
              framed
              scope={{ kind: "project", projectId: project.id }}
              title="Environment variables"
              empty="None yet. Add what the project needs to run, such as a database URL or an API key."
            />
            <InheritedVariables framed projectId={project.id} />
            {project.repoFullName && (
              <RepoTracked key={`tracked-${project.id}`} projectId={project.id} />
            )}
            <RepoCommits key={project.id} project={project} />
          </div>
        </div>
      </main>
    </div>
  );
}
