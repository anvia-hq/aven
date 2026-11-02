import { SectionCard } from "@/components/section-card";
import { timeAgo } from "@/lib/format";

import type { Project } from "../types";
import { ProjectDelete } from "./project-delete";
import { ProjectRunner } from "./project-runner";

const row = "flex items-center justify-between gap-4 px-4 py-2.5 text-sm";

// What the project is: the facts the repository page keeps in its side column.
export function ProjectAbout({ project }: { project: Project }) {
  return (
    <SectionCard title="About">
      <dl className="divide-y">
        <div className={row}>
          <dt className="text-muted-foreground">Runner</dt>
          <dd>
            <ProjectRunner project={project} />
          </dd>
        </div>
        <div className={row}>
          <dt className="text-muted-foreground">Default branch</dt>
          <dd className="font-mono text-xs">{project.defaultBranch}</dd>
        </div>
        <div className={row}>
          <dt className="text-muted-foreground">Imported</dt>
          <dd>{timeAgo(project.createdAt, true)}</dd>
        </div>
      </dl>
      <ProjectDelete project={project} />
    </SectionCard>
  );
}
