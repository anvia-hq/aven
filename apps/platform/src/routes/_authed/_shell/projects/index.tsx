import { createFileRoute } from "@tanstack/react-router";

import { parseProjectsSearch } from "@/modules/projects/filters";
import { ProjectsPage } from "@/modules/projects/components/projects-page";

export const Route = createFileRoute("/_authed/_shell/projects/")({
  validateSearch: parseProjectsSearch,
  component: ProjectsPage,
});
