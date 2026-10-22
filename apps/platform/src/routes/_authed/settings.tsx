import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SettingsNav } from "@/modules/settings/components/settings-nav";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="flex w-full flex-col gap-6 p-6 md:flex-row lg:p-8">
      <SettingsNav />
      <main className="flex min-w-0 max-w-3xl flex-1 flex-col gap-8">
        <Outlet />
      </main>
    </div>
  );
}
