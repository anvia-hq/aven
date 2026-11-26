import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@aven/ui/select";
import { RuntimeBadge } from "@/modules/runtimes/components/runtime-badge";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import { runtimeLabel } from "@/modules/runtimes/runtime-label";

import { useCanManageProject } from "../hooks/use-can-manage-project";
import { useProjects } from "../hooks/use-projects";
import type { Project } from "../types";

export function ProjectRunner({ project, className }: { project: Project; className: string }) {
  const canManage = useCanManageProject(project);
  const { runtimes } = useRuntimes();
  const { moveProject } = useProjects();

  if (!canManage || project.runtimeId === null)
    return (
      <div className={className}>
        <dt className="text-muted-foreground">Runner</dt>
        <dd>
          <RuntimeBadge runtimeId={project.runtimeId} />
        </dd>
      </div>
    );

  const options = runtimes.map((runtime) => ({ value: runtime.id, label: runtimeLabel(runtime) }));
  return (
    <div className={className}>
      <dt className="flex min-w-0 flex-col">
        <span className="text-muted-foreground">Runner</span>
        <span className="text-xs text-muted-foreground/70">
          Threads already started stay on their runner.
        </span>
      </dt>
      <dd className="-mr-2.5">
        <Select
          items={options}
          value={project.runtimeId}
          onValueChange={(next) => next && next !== project.runtimeId && moveProject(project, next)}
        >
          <SelectTrigger
            aria-label="Runner"
            className="border-transparent bg-transparent hover:bg-muted dark:border-transparent dark:bg-transparent dark:hover:bg-muted"
          >
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
      </dd>
    </div>
  );
}
