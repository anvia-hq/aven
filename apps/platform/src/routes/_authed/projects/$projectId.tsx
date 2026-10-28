import { createFileRoute, Link } from "@tanstack/react-router";

import { CommitList } from "@/modules/projects/components/commit-list";
import { FileTable } from "@/modules/projects/components/file-table";
import { ProjectHeader } from "@/modules/projects/components/project-header";
import { useProject } from "@/modules/projects/hooks/use-project";

export const Route = createFileRoute("/_authed/projects/$projectId")({
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const project = useProject(projectId);

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

        <CommitList commits={project.commits} branch={project.defaultBranch} />

        <FileTable files={project.files} lastCommit={project.commits[0]} />
      </main>
    </div>
  );
}
