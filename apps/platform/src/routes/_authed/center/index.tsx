import { createFileRoute } from "@tanstack/react-router";

import { CenterPage } from "@/modules/center/components/center-page";

export const Route = createFileRoute("/_authed/center/")({
  // `project` picks one project to look at; without it, all of them.
  validateSearch: (search: Record<string, unknown>): { project?: string } => ({
    project: typeof search.project === "string" ? search.project : undefined,
  }),
  component: CenterPage,
});
