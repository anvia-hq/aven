import { RuntimeBadge } from "@/modules/runtimes/components/runtime-badge";
import { timeAgo } from "@/lib/format";

import type { Project } from "../types";

// What the project is: the facts the repository page keeps in its side column.
export function ProjectAbout({ project }: { project: Project }) {
  return (
    <section aria-label="About" className="flex flex-col gap-2">
      <h2 className="text-sm text-muted-foreground">About</h2>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-4 text-sm">
        <dt className="text-muted-foreground">Runner</dt>
        <dd className="justify-self-end">
          <RuntimeBadge runtimeId={project.runtimeId} />
        </dd>
        <dt className="text-muted-foreground">Default branch</dt>
        <dd className="justify-self-end font-mono text-xs">{project.defaultBranch}</dd>
        <dt className="text-muted-foreground">Imported</dt>
        <dd className="justify-self-end">{timeAgo(project.createdAt, true)}</dd>
      </dl>
    </section>
  );
}
