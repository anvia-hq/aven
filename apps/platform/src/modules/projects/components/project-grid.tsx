import { useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";

import { useProjects } from "../hooks/use-projects";
import { ProjectCard } from "./project-card";

type Filter = "all" | "active" | "archived";

export function ProjectGrid() {
  const { projects } = useProjects();
  const [filter, setFilter] = useState<Filter>("all");

  const visible = projects.filter((project) => filter === "all" || project.status === filter);

  return (
    <>
      <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      <section aria-label="Project list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
        {visible.length === 0 && (
          <p className="text-sm text-muted-foreground">No projects in this view.</p>
        )}
      </section>
    </>
  );
}
