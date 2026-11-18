import { FolderIcon } from "@solar-icons/react/linear";

import { useProjects } from "../hooks/use-projects";

export function ProjectInfo({ projectId }: { projectId: string }) {
  const { projects } = useProjects();
  const project = projects.find((item) => item.id === projectId);

  if (!project) return null;

  return (
    <div
      title="The project of this thread"
      className="flex h-7 max-w-48 min-w-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 dark:border-input dark:bg-input/30 text-[0.8rem] text-muted-foreground select-none"
    >
      <FolderIcon className="size-4 shrink-0" />
      <span className="truncate">
        <span className="sr-only">Project: </span>
        {project.name}
      </span>
    </div>
  );
}
