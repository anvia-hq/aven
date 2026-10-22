import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/breadcrumb";

import { useProjects } from "../hooks/use-projects";
import type { Project } from "../types";

export function ProjectHeader({ project }: { project: Project }) {
  const { setArchived } = useProjects();
  const archived = project.status === "archived";
  const [owner = "", repoName = project.name] = project.repo.split("/");

  return (
    <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/projects" />}>Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>{owner}</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{repoName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-2">
        {archived && <Badge variant="secondary">Archived</Badge>}
        <Button variant="outline" size="sm" onClick={() => setArchived(project.id, !archived)}>
          {archived ? "Restore" : "Archive"}
        </Button>
      </div>
    </header>
  );
}
