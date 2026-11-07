import { Folder } from "@mynaui/icons-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";

import { useProjects } from "../hooks/use-projects";

type Props = {
  value: string | undefined;
  onChange: (projectId: string) => void;
};

export function ProjectPicker({ value, onChange }: Props) {
  const { projects } = useProjects();

  return (
    <Select
      items={projects.map((project) => ({ value: project.id, label: project.name }))}
      value={value ?? ""}
      onValueChange={(next) => next && onChange(next)}
    >
      <SelectTrigger
        size="sm"
        aria-label="Project"
        className="max-w-48 min-w-0 border-0 bg-muted/50 px-2 text-muted-foreground dark:bg-muted/50"
      >
        <Folder />
        <SelectValue placeholder="Choose a project" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            <span className="flex min-w-0 items-center gap-2">
              <Folder className="text-muted-foreground" />
              {project.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
