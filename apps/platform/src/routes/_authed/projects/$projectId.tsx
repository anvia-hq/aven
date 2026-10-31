import { createFileRoute } from "@tanstack/react-router";

import { NotFound } from "@/components/not-found";
import { ProjectHeader } from "@/modules/projects/components/project-header";
import { useProject } from "@/modules/projects/hooks/use-project";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import { InheritedVariables } from "@/modules/variables/components/inherited-variables";
import { VariablesSection } from "@/modules/variables/components/variables-section";

export const Route = createFileRoute("/_authed/projects/$projectId")({
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
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

      {/* The page is centered as one group, below the 2.5rem header, so the composer's `/` and `@` menus open upward with room. */}
      <main className="mx-auto flex min-h-[calc(100svh-2.5rem)] w-full max-w-2xl flex-col justify-center gap-5 p-4">
        <PromptInput
          placeholder={`Ask anything about ${project.name}…`}
          onSubmit={(message, selection) => startThread(project.id, message, selection)}
        />

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
      </main>
    </div>
  );
}
