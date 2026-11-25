import { createFileRoute } from "@tanstack/react-router";

import { AutomationsPage } from "@/modules/automations/components/automations-page";
import type { AutomationFilter } from "@/modules/automations/types";

const FILTERS = new Set<AutomationFilter>(["all", "schedule", "webhook", "paused"]);

export const Route = createFileRoute("/_authed/automations/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { filter?: AutomationFilter; selected?: string } => ({
    filter:
      typeof search.filter === "string" && FILTERS.has(search.filter as AutomationFilter)
        ? (search.filter as AutomationFilter)
        : undefined,
    selected:
      typeof search.selected === "string" && search.selected !== "" ? search.selected : undefined,
  }),
  component: AutomationsRoute,
});

function AutomationsRoute() {
  const { filter, selected } = Route.useSearch();
  return <AutomationsPage filter={filter ?? "all"} selectedId={selected} />;
}
