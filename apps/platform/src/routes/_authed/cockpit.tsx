import { createFileRoute } from "@tanstack/react-router";

import { CockpitSidebar } from "@/modules/cockpit/components/cockpit-sidebar";
import { AppShell } from "@/modules/navigation/components/app-shell";

// The cockpit's shell (decision 0104): the same frame as threads and the bot, with its pages and
// the person's tags in the sidebar.
export const Route = createFileRoute("/_authed/cockpit")({
  component: CockpitLayout,
});

function CockpitLayout() {
  const { user } = Route.useRouteContext();
  return <AppShell user={user} sidebar={<CockpitSidebar />} />;
}
