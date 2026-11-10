import { Skeleton } from "@/components/skeleton";
import type { Thread } from "@/modules/threads/types";

import type { Project } from "../types";
import { ProjectCard } from "./project-card";

type Props = {
  projects: Project[];
  threads: Thread[];
  palettes: Map<string, number>;
  loaded: boolean;
};

export function ProjectList({ projects, threads, palettes, loaded }: Props) {
  if (!loaded) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((card) => (
          <Skeleton key={card} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <ul aria-label="Projects" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {projects.map((project) => (
        <li key={project.id}>
          <ProjectCard project={project} palette={palettes.get(project.id)} threads={threads} />
        </li>
      ))}
    </ul>
  );
}
