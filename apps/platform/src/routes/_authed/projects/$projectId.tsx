import { createFileRoute, Link } from "@tanstack/react-router";

import { ProjectHeader } from "@/modules/projects/components/project-header";
import { useProject } from "@/modules/projects/hooks/use-project";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";
import { useThreads } from "@/modules/threads/hooks/use-threads";

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
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-2">
        <h1 className="text-xl font-semibold">Project not found</h1>
        <Link to="/projects" className="text-sm text-muted-foreground underline">
          Back to projects
        </Link>
      </main>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <ProjectHeader project={project} />

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6 lg:p-8">
        <PromptInput
          placeholder={`Ask anything about ${project.name}…`}
          onSubmit={(prompt, selection) => void startThread(project.id, prompt, selection)}
        />

        <section aria-label="Recent threads" className="flex flex-col gap-3">
          <h2 className="text-sm text-muted-foreground">Recent threads</h2>
          <ThreadList threads={threads} empty="No threads in this project yet." />
        </section>
      </main>
    </div>
  );
}
