import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";

import { useProjects } from "../hooks/use-projects";
import type { Project } from "../types";
import { ImportRepositoryDialog } from "./import-repository-dialog";

type Props = {
  value: string | undefined;
  onChange: (projectId: string) => void;
};

// Every thread belongs to a project; this picks one, or imports a repository and picks that.
export function ProjectPicker({ value, onChange }: Props) {
  const { projects } = useProjects();

  return (
    <div className="flex items-center gap-2">
      <Select
        items={projects.map((project) => ({ value: project.id, label: project.name }))}
        value={value ?? ""}
        onValueChange={(next) => next && onChange(next)}
      >
        <SelectTrigger aria-label="Project" className="w-full">
          <SelectValue placeholder="Choose a project" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ImportRepositoryDialog onImported={(project: Project) => onChange(project.id)} />
    </div>
  );
}
