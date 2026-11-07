import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/modules/navigation/components/app-shell";
import { SidebarTabs } from "@/modules/navigation/components/sidebar-tabs";
import { SidebarThreads } from "@/modules/threads/components/sidebar-threads";

export const Route = createFileRoute("/_authed/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  const { user } = Route.useRouteContext();

  return (
    <AppShell
      user={user}
      sidebar={
        <>
          <SidebarTabs />
          <SidebarThreads />
        </>
      }
    />
  );
}
