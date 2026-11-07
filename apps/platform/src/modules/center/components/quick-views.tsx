import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";

import { activeQuickView, QUICK_VIEWS } from "../filters";
import type { CenterFilters } from "../types";

export function QuickViews({
  filters,
  connected,
  onPick,
}: {
  filters: CenterFilters;
  connected: boolean;
  onPick: (id: (typeof QUICK_VIEWS)[number]["id"]) => void;
}) {
  const active = activeQuickView(filters);
  return (
    <Tabs
      value={active?.id ?? ""}
      onValueChange={(id) => onPick(id as (typeof QUICK_VIEWS)[number]["id"])}
    >
      <TabsList
        variant="line"
        aria-label="Quick views"
        className="h-9 w-full justify-start gap-1 overflow-x-auto border-b"
      >
        {QUICK_VIEWS.map((view) => {
          const own = "author" in view.filters || "reviewRequested" in view.filters;
          return (
            <TabsTrigger
              key={view.id}
              value={view.id}
              disabled={own && !connected}
              title={own && !connected ? "Connect your GitHub account to use this view" : undefined}
              className="flex-none px-3"
            >
              {view.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
