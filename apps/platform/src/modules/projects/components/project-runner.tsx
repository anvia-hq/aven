import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { RuntimeBadge } from "@/modules/runtimes/components/runtime-badge";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import { runtimeLabel } from "@/modules/runtimes/runtime-label";

import { useCanManageProject } from "../hooks/use-can-manage-project";
import { useProjects } from "../hooks/use-projects";
import type { Project } from "../types";

export function ProjectRunner({ project }: { project: Project }) {
  const canManage = useCanManageProject(project);
  const { runtimes } = useRuntimes();
  const { moveProject } = useProjects();

  if (!canManage) return <RuntimeBadge runtimeId={project.runtimeId} />;

  const options = runtimes.map((runtime) => ({ value: runtime.id, label: runtimeLabel(runtime) }));
  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        items={options}
        value={project.runtimeId}
        onValueChange={(next) => next && next !== project.runtimeId && moveProject(project, next)}
      >
        <SelectTrigger size="sm" aria-label="Runner">
          <SelectValue placeholder="Runner revoked" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">
        Threads already started stay on their runner.
      </span>
    </div>
  );
}
