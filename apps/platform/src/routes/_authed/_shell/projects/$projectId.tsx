import { createFileRoute } from "@tanstack/react-router";

import { NotFound } from "@/components/not-found";
import { ProjectAbout } from "@/modules/projects/components/project-about";
import { ProjectHeader } from "@/modules/projects/components/project-header";
import { ProjectTitle } from "@/modules/projects/components/project-title";
import { RepoFiles } from "@/modules/projects/components/repo-files";
import { RepoReadme } from "@/modules/projects/components/repo-readme";
import { useProject } from "@/modules/projects/hooks/use-project";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import { InheritedVariables } from "@/modules/variables/components/inherited-variables";
import { VariablesSection } from "@/modules/variables/components/variables-section";

export const Route = createFileRoute("/_authed/_shell/projects/$projectId")({
  // The folder of the repository being looked at, from its top; none is the top.
  validateSearch: (search: Record<string, unknown>): { path?: string } => ({
    path: typeof search.path === "string" && search.path !== "" ? search.path : undefined,
  }),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { path = "" } = Route.useSearch();
  const { project, loaded } = useProject(projectId);
  const startThread = useStartThread();
  const threads = useThreads().threads.filter((thread) => thread.projectId === projectId);

  if (!project) {
    if (!loaded) return null;
    return <NotFound as="main" title="Project not found" to="/projects" back="Back to projects" />;
  }

  return (
    <div className="flex w-full min-w-0 flex-col">
      <ProjectHeader project={project} />

      {/* A repository page: the repository on the left, what is about the project on the right. */}
      <main className="mx-auto grid w-full max-w-6xl gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <ProjectTitle project={project} />
          <RepoFiles project={project} path={path} />
          {path === "" && <RepoReadme project={project} />}
          {/* The composer's `/` and `@` menus open upward, so it stays at the bottom of the screen. */}
          <div className="sticky bottom-4 z-10">
            <PromptInput
              placeholder={`Ask anything about ${project.name}…`}
              onSubmit={(message, selection) => startThread(project.id, message, selection)}
            />
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <ProjectAbout project={project} />
          <section aria-label="Recent threads" className="flex flex-col gap-2">
            <h2 className="text-sm text-muted-foreground">Recent threads</h2>
            <ThreadList threads={threads} empty="No threads in this project yet." />
          </section>
          <VariablesSection
            scope={{ kind: "project", projectId: project.id }}
            title="Environment variables"
            empty="None yet. Add what the project needs to run, such as a database URL or an API key."
          />
          <InheritedVariables projectId={project.id} />
        </aside>
      </main>
    </div>
  );
}
