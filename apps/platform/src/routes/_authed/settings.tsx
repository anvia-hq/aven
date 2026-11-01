import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/modules/navigation/components/app-shell";
import { SettingsSidebar } from "@/modules/settings/components/settings-sidebar";

// Settings has the shell threads and the bot have, with its pages in the sidebar.
export const Route = createFileRoute("/_authed/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { user } = Route.useRouteContext();
  return <AppShell user={user} sidebar={<SettingsSidebar />} />;
}
