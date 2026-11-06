import { createFileRoute } from "@tanstack/react-router";

import { CenterSidebar } from "@/modules/center/components/center-sidebar";
import { AppShell } from "@/modules/navigation/components/app-shell";

// Center's shell: the same frame as threads, the bot and the cockpit, with the projects in the sidebar.
export const Route = createFileRoute("/_authed/center")({
  component: CenterLayout,
});

function CenterLayout() {
  const { user } = Route.useRouteContext();
  return <AppShell user={user} sidebar={<CenterSidebar />} />;
}
