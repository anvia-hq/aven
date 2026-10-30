import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SettingsNav } from "@/modules/settings/components/settings-nav";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4 p-4 md:flex-row md:gap-8">
      <SettingsNav />
      <main className="flex min-w-0 max-w-2xl flex-1 flex-col gap-5">
        <Outlet />
      </main>
    </div>
  );
}
