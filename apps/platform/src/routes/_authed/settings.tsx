import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/modules/navigation/components/app-shell";
import { SettingsSidebar } from "@/modules/settings/components/settings-sidebar";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { user } = Route.useRouteContext();
  return <AppShell user={user} sidebar={<SettingsSidebar />} />;
}
