import { createFileRoute } from "@tanstack/react-router";

import { CockpitSidebar } from "@/modules/cockpit/components/cockpit-sidebar";
import { AppShell } from "@/modules/navigation/components/app-shell";

export const Route = createFileRoute("/_authed/cockpit")({
  component: CockpitLayout,
});

function CockpitLayout() {
  const { user } = Route.useRouteContext();
  return <AppShell user={user} sidebar={<CockpitSidebar />} />;
}
