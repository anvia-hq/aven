import { createFileRoute, Link } from "@tanstack/react-router";

import { CommitList } from "@/modules/projects/components/commit-list";
import { FileTable } from "@/modules/projects/components/file-table";
import { ProjectHeader } from "@/modules/projects/components/project-header";
import { useProject } from "@/modules/projects/hooks/use-project";
import { useProjectThreads } from "@/modules/projects/hooks/use-project-threads";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";

export const Route = createFileRoute("/_authed/projects/$projectId")({
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const project = useProject(projectId);
  const threads = useProjectThreads(projectId);
  const start = useStartThread(projectId);

  if (!project) {
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

      <main className="flex flex-col gap-8 p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">{project.description}</p>

        {project.status === "active" && (
          <section aria-label="Start a thread" className="max-w-3xl">
            <PromptInput onSubmit={start} placeholder={`Ask the agent about ${project.name}…`} />
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-label="Recent threads" className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent threads</h2>
              <Link to="/threads" className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </Link>
            </div>
            <ThreadList threads={threads.slice(0, 4)} empty="No threads yet." />
          </section>
          <CommitList commits={project.commits} branch={project.defaultBranch} />
        </div>

        <FileTable files={project.files} lastCommit={project.commits[0]} />
      </main>
    </div>
  );
}
