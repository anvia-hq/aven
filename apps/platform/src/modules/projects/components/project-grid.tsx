import { useProjects } from "../hooks/use-projects";
import { ProjectCard } from "./project-card";

export function ProjectGrid() {
  const { projects } = useProjects();

  return (
    <section aria-label="Project list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
      {projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
    </section>
  );
}
