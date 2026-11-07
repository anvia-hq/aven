import { Folder } from "@mynaui/icons-react";

import { useProjects } from "../hooks/use-projects";

export function ProjectInfo({ projectId }: { projectId: string }) {
  const { projects } = useProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) return null;

  return (
    <div
      title="The project of this thread"
      className="flex h-7 max-w-48 min-w-0 items-center gap-1.5 rounded-lg bg-muted/50 px-2 text-sm text-muted-foreground select-none"
    >
      <Folder className="size-4 shrink-0" />
      <span className="truncate">
        <span className="sr-only">Project: </span>
        {project.name}
      </span>
    </div>
  );
}
