import { createFileRoute } from "@tanstack/react-router";

import { ProjectDetailPage } from "@/modules/projects/components/project-page";
import type { ProjectTab } from "@/modules/projects/types";

const TABS: readonly ProjectTab[] = ["code", "threads", "activity", "settings"];

export const Route = createFileRoute("/_authed/projects/$projectId")({
  validateSearch: (search: Record<string, unknown>): { path?: string; tab?: ProjectTab } => {
    const tab = TABS.find((candidate) => candidate === search.tab);
    return {
      path: typeof search.path === "string" && search.path !== "" ? search.path : undefined,
      tab: tab === "code" ? undefined : tab,
    };
  },
  component: ProjectRoute,
});

function ProjectRoute() {
  const { projectId } = Route.useParams();
  const { path = "", tab } = Route.useSearch();

  return <ProjectDetailPage projectId={projectId} path={path} tab={tab} />;
}
